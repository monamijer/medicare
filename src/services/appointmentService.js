const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const AvailabilitySlot = require('../models/AvailabilitySlot');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const HttpError = require('../utils/httpError');

const UNAVAILABLE = "Ce créneau n'est plus disponible.";

const populateAll = (query) => query
  .populate({ path: 'doctor', populate: [{ path: 'user', select: 'firstName lastName' }, { path: 'specialty', select: 'name' }] })
  .populate({ path: 'patient', populate: { path: 'user', select: 'firstName lastName' } });

// Doctors of a specialty with their number of upcoming free slots.
async function searchDoctors(specialtyId) {
  const doctors = await Doctor.find({ specialty: specialtyId }).populate('user', 'firstName lastName').lean();
  const counts = await AvailabilitySlot.aggregate([
    { $match: { doctor: { $in: doctors.map((d) => d._id) }, status: 'free', start: { $gt: new Date() } } },
    { $group: { _id: '$doctor', count: { $sum: 1 } } },
  ]);
  const byDoctor = new Map(counts.map((c) => [String(c._id), c.count]));
  const collator = new Intl.Collator('fr', { sensitivity: 'base' });
  return doctors
    .map((doctor) => ({ doctor, freeSlots: byDoctor.get(String(doctor._id)) || 0 }))
    .sort((a, b) => collator.compare(`${a.doctor.user.lastName} ${a.doctor.user.firstName}`, `${b.doctor.user.lastName} ${b.doctor.user.firstName}`));
}

function listFreeSlots(doctorId) {
  return AvailabilitySlot.find({ doctor: doctorId, status: 'free', start: { $gt: new Date() } }).sort({ start: 1 }).lean();
}

// A slot a patient may still book: free and in the future.
async function getBookableSlot(slotId) {
  if (!mongoose.isValidObjectId(slotId)) throw new HttpError(404, 'Créneau introuvable.');
  const slot = await AvailabilitySlot.findById(slotId).lean();
  if (!slot) throw new HttpError(404, 'Créneau introuvable.');
  if (slot.status !== 'free' || slot.start <= new Date()) throw new HttpError(409, UNAVAILABLE);
  return slot;
}

async function book(userId, slotId, reason = '') {
  const patient = await Patient.findOne({ user: userId });
  if (!patient) throw new HttpError(403, 'Seuls les patients peuvent prendre rendez-vous.');
  if (!mongoose.isValidObjectId(slotId)) throw new HttpError(404, 'Créneau introuvable.');
  const wanted = await AvailabilitySlot.findById(slotId).lean();
  if (!wanted) throw new HttpError(404, 'Créneau introuvable.');

  if (await Appointment.exists({ patient: patient._id, status: 'confirmed', start: { $lt: wanted.end }, end: { $gt: wanted.start } })) {
    throw new HttpError(409, 'Vous avez déjà un rendez-vous à cette heure.');
  }

  // Atomic claim: only one request can flip the slot from free to booked.
  const slot = await AvailabilitySlot.findOneAndUpdate(
    { _id: slotId, status: 'free', start: { $gt: new Date() } },
    { status: 'booked' },
    { returnDocument: 'after' }
  );
  if (!slot) throw new HttpError(409, UNAVAILABLE);

  try {
    return await Appointment.create({
      slot: slot._id, doctor: slot.doctor, patient: patient._id, start: slot.start, end: slot.end, reason,
    });
  } catch (err) {
    await AvailabilitySlot.updateOne({ _id: slot._id }, { status: 'free' }); // give the slot back
    if (err.code === 11000) throw new HttpError(409, UNAVAILABLE);
    if (err.name === 'ValidationError') throw new HttpError(422, 'Les informations du rendez-vous sont invalides.');
    throw err;
  }
}

// Which appointments a user owns: patients and doctors their own, admins everything.
// Returns null when a patient/doctor account has no profile.
async function ownerFilter(user) {
  if (user.role === 'patient') {
    const patient = await Patient.findOne({ user: user.id }).select('_id').lean();
    return patient ? { patient: patient._id } : null;
  }
  if (user.role === 'doctor') {
    const doctor = await Doctor.findOne({ user: user.id }).select('_id').lean();
    return doctor ? { doctor: doctor._id } : null;
  }
  return {};
}

async function listFor(user) {
  const filter = await ownerFilter(user);
  if (!filter) return { upcoming: [], history: [] };
  const all = await populateAll(Appointment.find(filter)).lean();
  const now = new Date();
  const isUpcoming = (a) => a.status === 'confirmed' && a.end > now;
  return {
    upcoming: all.filter(isUpcoming).sort((a, b) => a.start - b.start),
    history: all.filter((a) => !isUpcoming(a)).sort((a, b) => b.start - a.start),
  };
}

// Loads an appointment the user owns. Other people's appointments look like they do not exist.
async function loadOwned(user, id) {
  const notFound = new HttpError(404, 'Rendez-vous introuvable.');
  if (!mongoose.isValidObjectId(id)) throw notFound;
  const appointment = await Appointment.findById(id).lean();
  const filter = await ownerFilter(user);
  const allowed = appointment && filter && Object.entries(filter).every(([key, value]) => String(appointment[key]) === String(value));
  if (!allowed) throw notFound;
  return appointment;
}

function assertModifiable(appointment) {
  if (appointment.status === 'cancelled') throw new HttpError(409, 'Ce rendez-vous est annulé : il ne peut plus être modifié.');
  if (appointment.start <= new Date()) throw new HttpError(409, 'Ce rendez-vous est passé : il ne peut plus être modifié.');
}

const releaseSlot = (slotId) => AvailabilitySlot.updateOne({ _id: slotId, status: 'booked' }, { status: 'free' });

// Cancel an upcoming appointment and free its slot.
// Order matters: the appointment is cancelled atomically FIRST, so a second cancel can never
// release a slot that someone else has booked in the meantime.
async function cancel(user, id) {
  await loadOwned(user, id);
  const now = new Date();
  const cancelled = await Appointment.findOneAndUpdate(
    { _id: id, status: 'confirmed', start: { $gt: now } },
    { status: 'cancelled', cancelledAt: now, cancelledBy: user.role },
    { returnDocument: 'after' }
  );
  if (!cancelled) {
    const fresh = await Appointment.findById(id).lean();
    throw new HttpError(409, fresh && fresh.status === 'cancelled'
      ? 'Ce rendez-vous est déjà annulé.'
      : 'Ce rendez-vous est passé : il ne peut plus être annulé.');
  }
  await releaseSlot(cancelled.slot);
  return cancelled;
}

// Data for the "modify" page: the appointment plus the other free slots of the same doctor.
async function getForModify(user, id) {
  const appointment = await loadOwned(user, id);
  assertModifiable(appointment);
  const [populated, freeSlots] = await Promise.all([
    populateAll(Appointment.findById(id)).lean(),
    listFreeSlots(appointment.doctor),
  ]);
  return { appointment: populated, freeSlots };
}

// Move an appointment to another free slot of the same doctor and/or change its reason.
// Safe order: claim the new slot -> switch the appointment (atomic, guarded by its current slot)
// -> release the old slot. The appointment is never without a booked slot, and any failure
// puts the claimed slot back.
async function modify(user, id, { slotId, reason = '' }) {
  if (user.role === 'doctor') throw new HttpError(403, 'Les médecins ne peuvent pas déplacer un rendez-vous.');
  const appointment = await loadOwned(user, id);
  assertModifiable(appointment);

  if (String(slotId) === String(appointment.slot)) {
    const updated = await Appointment.findOneAndUpdate({ _id: id, status: 'confirmed', slot: appointment.slot }, { reason }, { returnDocument: 'after', runValidators: true });
    if (!updated) throw new HttpError(409, "Ce rendez-vous n'est plus modifiable.");
    return updated;
  }

  if (!mongoose.isValidObjectId(slotId)) throw new HttpError(404, 'Créneau introuvable.');
  const wanted = await AvailabilitySlot.findById(slotId).lean();
  if (!wanted) throw new HttpError(409, UNAVAILABLE); // e.g. the doctor deleted it while the page was open
  if (String(wanted.doctor) !== String(appointment.doctor)) {
    throw new HttpError(422, 'Choisissez un créneau du même médecin. Pour un autre médecin, annulez puis reprenez rendez-vous.');
  }
  if (await Appointment.exists({ _id: { $ne: id }, patient: appointment.patient, status: 'confirmed', start: { $lt: wanted.end }, end: { $gt: wanted.start } })) {
    throw new HttpError(409, 'Vous avez déjà un rendez-vous à cette heure.');
  }

  const claimed = await AvailabilitySlot.findOneAndUpdate(
    { _id: slotId, doctor: appointment.doctor, status: 'free', start: { $gt: new Date() } },
    { status: 'booked' },
    { returnDocument: 'after' }
  );
  if (!claimed) throw new HttpError(409, UNAVAILABLE);

  let moved;
  try {
    moved = await Appointment.findOneAndUpdate(
      { _id: id, status: 'confirmed', slot: appointment.slot },
      { slot: claimed._id, start: claimed.start, end: claimed.end, reason },
      { returnDocument: 'after', runValidators: true }
    );
  } catch (err) {
    await releaseSlot(claimed._id);
    throw err.code === 11000 ? new HttpError(409, UNAVAILABLE) : err;
  }
  if (!moved) {
    await releaseSlot(claimed._id); // cancelled or moved by someone else in the meantime
    throw new HttpError(409, "Ce rendez-vous n'est plus modifiable.");
  }
  await releaseSlot(appointment.slot);
  return moved;
}

module.exports = { searchDoctors, listFreeSlots, getBookableSlot, book, listFor, cancel, getForModify, modify };
