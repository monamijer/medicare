const mongoose = require('mongoose');
const doctorService = require('../../services/doctorService');
const appointmentService = require('../../services/appointmentService');
const HttpError = require('../../utils/httpError');
const config = require('../../config/env');
const { doctorDto, slotDto } = require('../../utils/serializers');

const isAdmin = (req) => req.session.user.role === 'admin';
const FIELDS = ['firstName', 'lastName', 'email', 'password', 'specialty', 'licenseNumber', 'phone'];
const pick = (body) => Object.fromEntries(FIELDS.map((f) => [f, body[f] === undefined || body[f] === null ? '' : String(body[f]).trim()]));

// Deactivated doctors are invisible to everyone but admins.
async function visibleDoctor(req) {
  const doctor = await doctorService.get(req.params.id);
  if (!isAdmin(req) && doctor.user.active === false) throw new HttpError(404, 'Médecin introuvable.');
  return doctor;
}

async function list(req, res) {
  const { specialty } = req.query;
  if (specialty !== undefined && !mongoose.isValidObjectId(specialty)) {
    throw HttpError.validation({ specialty: 'Identifiant de spécialité invalide.' });
  }
  let doctors = await doctorService.list();
  if (specialty) doctors = doctors.filter((d) => String(d.specialty._id) === specialty);
  if (!isAdmin(req)) doctors = doctors.filter((d) => d.user.active !== false);
  res.json({ doctors: doctors.map((d) => doctorDto(d, { admin: isAdmin(req) })) });
}

async function show(req, res) {
  res.json({ doctor: doctorDto(await visibleDoctor(req), { admin: isAdmin(req) }) });
}

async function create(req, res) {
  const created = await doctorService.create(pick(req.body));
  res.status(201).json({ doctor: doctorDto(await doctorService.get(created.id), { admin: true }) });
}

async function update(req, res) {
  await doctorService.update(req.params.id, pick(req.body));
  res.json({ doctor: doctorDto(await doctorService.get(req.params.id), { admin: true }) });
}

// 200 { result: 'deleted' | 'deactivated' }; 409 while upcoming appointments exist.
async function remove(req, res) {
  const { deactivated } = await doctorService.remove(req.params.id);
  res.json({ result: deactivated ? 'deactivated' : 'deleted' });
}

async function reactivate(req, res) {
  await doctorService.reactivate(req.params.id);
  res.json({ doctor: doctorDto(await doctorService.get(req.params.id), { admin: true }) });
}

// Upcoming free slots a patient could book.
async function slots(req, res) {
  const doctor = await visibleDoctor(req);
  const free = await appointmentService.listFreeSlots(doctor._id);
  res.json({ timezone: config.clinicTimezone, slots: free.map(slotDto) });
}

module.exports = { list, show, create, update, remove, reactivate, slots };
