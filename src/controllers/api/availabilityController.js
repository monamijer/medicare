const availabilityService = require('../../services/availabilityService');
const doctorService = require('../../services/doctorService');
const HttpError = require('../../utils/httpError');
const config = require('../../config/env');
const { availabilitySlotDto } = require('../../utils/serializers');

const isAdmin = (req) => req.session.user.role === 'admin';
const text = (value, fallback = '') => (value === undefined || value === null ? fallback : String(value).trim());
const pick = (body) => ({ date: text(body.date), from: text(body.from), to: text(body.to), duration: text(body.duration, '30') });

// A doctor always works on their own slots. An admin names the doctor with ?doctor=<id> (or in the body).
async function resolveDoctor(req) {
  if (!isAdmin(req)) return doctorService.getByUser(req.session.user.id);
  const id = req.query.doctor || (req.body && req.body.doctor);
  if (!id) throw HttpError.validation({ doctor: 'Précisez le médecin (paramètre doctor).' });
  return doctorService.get(id);
}

// A doctor can only reach their own slots (404 otherwise, so ids do not leak).
async function loadSlot(req) {
  const slot = await availabilityService.get(req.params.id);
  if (!isAdmin(req)) {
    const doctor = await doctorService.getByUser(req.session.user.id);
    if (String(slot.doctor) !== String(doctor._id)) throw new HttpError(404, 'Créneau introuvable.');
  }
  return slot;
}

async function list(req, res) {
  const doctor = await resolveDoctor(req);
  const slots = await availabilityService.listUpcoming(doctor._id);
  res.json({ timezone: config.clinicTimezone, doctor: { id: String(doctor._id), fullName: `${doctor.user.firstName} ${doctor.user.lastName}` }, slots: slots.map(availabilitySlotDto) });
}

async function show(req, res) {
  res.json({ slot: availabilitySlotDto(await loadSlot(req)) });
}

// Adds a range of slots, or one slot when duration is 0.
async function create(req, res) {
  const doctor = await resolveDoctor(req);
  const created = await availabilityService.createRange(doctor._id, pick(req.body));
  res.status(201).json({ created });
}

async function update(req, res) {
  await loadSlot(req);
  const { date, from, to } = pick(req.body);
  const slot = await availabilityService.update(req.params.id, { date, from, to });
  res.json({ slot: availabilitySlotDto(slot) });
}

async function remove(req, res) {
  await loadSlot(req);
  await availabilityService.remove(req.params.id);
  res.status(204).end();
}

module.exports = { list, show, create, update, remove };
