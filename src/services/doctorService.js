const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');
const Specialty = require('../models/Specialty');
const User = require('../models/User');
const userService = require('./userService');
const HttpError = require('../utils/httpError');

const NOT_FOUND = 'Médecin introuvable.';
const collator = new Intl.Collator('fr', { sensitivity: 'base' });

const populate = (query) => query.populate('user', 'firstName lastName email').populate('specialty', 'name');

async function list() {
  const doctors = await populate(Doctor.find()).lean();
  const key = (d) => `${d.user.lastName} ${d.user.firstName}`;
  return doctors.sort((a, b) => collator.compare(key(a), key(b)));
}

async function get(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, NOT_FOUND);
  const doctor = await populate(Doctor.findById(id)).lean();
  if (!doctor) throw new HttpError(404, NOT_FOUND);
  return doctor;
}

async function assertSpecialtyExists(id) {
  if (!mongoose.isValidObjectId(id) || !(await Specialty.exists({ _id: id }))) {
    throw new HttpError(422, 'Choisissez une spécialité valide.', 'specialty');
  }
}

async function assertLicenseFree(licenseNumber, exceptDoctorId) {
  const filter = { licenseNumber: String(licenseNumber).trim() };
  if (exceptDoctorId) filter._id = { $ne: exceptDoctorId };
  if (await Doctor.exists(filter)) {
    throw new HttpError(409, 'Ce numéro de licence est déjà utilisé.', 'licenseNumber');
  }
}

function translate(err) {
  if (err.code === 11000) return new HttpError(409, 'Ce numéro de licence est déjà utilisé.', 'licenseNumber');
  if (err.name === 'ValidationError') return new HttpError(422, 'Les informations du médecin sont invalides.');
  return err;
}

async function create({ firstName, lastName, email, password, specialty, licenseNumber, phone }) {
  await assertSpecialtyExists(specialty);
  await assertLicenseFree(licenseNumber);
  const user = await userService.createUser({ email, password, firstName, lastName, role: 'doctor' });
  try {
    return await Doctor.create({ user: user.id, specialty, licenseNumber, phone });
  } catch (err) {
    await User.deleteOne({ _id: user.id }); // no orphan account if the profile cannot be saved
    throw translate(err);
  }
}

async function update(id, { firstName, lastName, email, password, specialty, licenseNumber, phone }) {
  const doctor = await Doctor.findById(id);
  if (!doctor) throw new HttpError(404, NOT_FOUND);
  await assertSpecialtyExists(specialty);
  await assertLicenseFree(licenseNumber, doctor.id);
  await userService.updateUser(doctor.user, { email, password, firstName, lastName });
  Object.assign(doctor, { specialty, licenseNumber, phone });
  try {
    return await doctor.save();
  } catch (err) {
    throw translate(err);
  }
}

async function remove(id) {
  const doctor = await get(id);
  await Doctor.deleteOne({ _id: id });
  await User.deleteOne({ _id: doctor.user._id });
  return doctor;
}

module.exports = { list, get, create, update, remove };
