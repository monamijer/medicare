const mongoose = require('mongoose');
const Slot = require('../models/AvailabilitySlot');
const HttpError = require('../utils/httpError');
const { zonedToUtc, formatDay, formatTime } = require('../utils/time');

const NOT_FOUND = 'Créneau introuvable.';
const MAX_SLOTS_PER_BATCH = 48;
const MINUTE = 60 * 1000;

function buildRange({ date, from, to, duration }) {
  const start = zonedToUtc(date, from);
  const end = zonedToUtc(date, to);
  if (!start) throw new HttpError(422, 'Saisissez une date et une heure de début valides.', 'date');
  if (!end || end <= start) throw new HttpError(422, "L'heure de fin doit être après l'heure de début.", 'to');
  if (start <= new Date()) throw new HttpError(422, 'Les créneaux doivent être dans le futur.', 'date');

  const step = Number(duration) ? Number(duration) * MINUTE : end - start;
  const slots = [];
  for (let t = start.getTime(); t + step <= end.getTime(); t += step) {
    slots.push({ start: new Date(t), end: new Date(t + step) });
  }
  if (!slots.length) throw new HttpError(422, 'La plage est plus courte que la durée choisie.', 'duration');
  if (slots.length > MAX_SLOTS_PER_BATCH) {
    throw new HttpError(422, `Vous pouvez ajouter ${MAX_SLOTS_PER_BATCH} créneaux au maximum à la fois.`, 'duration');
  }
  return slots;
}

function describe(slot) {
  return `le ${formatDay(slot.start)} de ${formatTime(slot.start)} à ${formatTime(slot.end)}`;
}

// Throws if any wanted slot overlaps an existing slot of the same doctor (booked or not).
async function assertNoOverlap(doctorId, wanted, exceptSlotId) {
  const from = wanted[0].start;
  const to = wanted[wanted.length - 1].end;
  const filter = { doctor: doctorId, start: { $lt: to }, end: { $gt: from } };
  if (exceptSlotId) filter._id = { $ne: exceptSlotId };
  const existing = await Slot.find(filter).lean();
  for (const slot of wanted) {
    const clash = existing.find((e) => e.start < slot.end && e.end > slot.start);
    if (clash) throw new HttpError(409, `Conflit avec un créneau existant ${describe(clash)}.`, 'date');
  }
}

async function listUpcoming(doctorId) {
  return Slot.find({ doctor: doctorId, end: { $gt: new Date() } }).sort({ start: 1 }).lean();
}

async function createRange(doctorId, input) {
  const wanted = buildRange(input);
  await assertNoOverlap(doctorId, wanted);
  const docs = wanted.map((s) => ({ _id: new mongoose.Types.ObjectId(), doctor: doctorId, ...s }));
  try {
    await Slot.insertMany(docs);
  } catch (err) {
    await Slot.deleteMany({ _id: { $in: docs.map((d) => d._id) } }); // all or nothing
    if (err.code === 11000) throw new HttpError(409, 'Un de ces créneaux vient d\'être ajouté par ailleurs. Réessayez.', 'date');
    throw err;
  }
  return docs.length;
}

async function get(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, NOT_FOUND);
  const slot = await Slot.findById(id).lean();
  if (!slot) throw new HttpError(404, NOT_FOUND);
  return slot;
}

function assertFree(slot, action) {
  if (slot.status !== 'free') {
    throw new HttpError(409, `Ce créneau est réservé : il ne peut pas être ${action}. Annulez d'abord le rendez-vous.`);
  }
}

async function update(id, { date, from, to }) {
  const slot = await get(id);
  assertFree(slot, 'modifié');
  const wanted = buildRange({ date, from, to, duration: 0 });
  await assertNoOverlap(slot.doctor, wanted, slot._id);
  try {
    // The status guard makes the edit fail if the slot was booked in the meantime.
    const updated = await Slot.findOneAndUpdate({ _id: id, status: 'free' }, wanted[0], { new: true });
    if (!updated) throw new HttpError(409, 'Ce créneau vient d\'être réservé : il ne peut pas être modifié.');
    return updated;
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'Un créneau commence déjà à cette heure.', 'date');
    throw err;
  }
}

async function remove(id) {
  const slot = await get(id);
  assertFree(slot, 'supprimé');
  const result = await Slot.deleteOne({ _id: id, status: 'free' });
  if (!result.deletedCount) throw new HttpError(409, 'Ce créneau vient d\'être réservé : il ne peut pas être supprimé.');
  return slot;
}

module.exports = { listUpcoming, createRange, get, update, remove };
