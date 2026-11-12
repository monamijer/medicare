const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const User = require('../models/User');
const userService = require('./userService');
const HttpError = require('../utils/httpError');
const { parseBirthDate } = require('../utils/dates');

const NOT_FOUND = 'Patient introuvable.';
const collator = new Intl.Collator('fr', { sensitivity: 'base' });

const populate = (query) => query.populate('user', 'firstName lastName email');

function checkBirthDate(value) {
  const date = parseBirthDate(value);
  if (!date) throw new HttpError(422, 'Saisissez une date de naissance valide (pas dans le futur).', 'birthDate');
  return date;
}

async function list() {
  const patients = await populate(Patient.find()).lean();
  const key = (p) => `${p.user.lastName} ${p.user.firstName}`;
  return patients.sort((a, b) => collator.compare(key(a), key(b)));
}

async function get(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, NOT_FOUND);
  const patient = await populate(Patient.findById(id)).lean();
  if (!patient) throw new HttpError(404, NOT_FOUND);
  return patient;
}

async function getByUser(userId) {
  const patient = await populate(Patient.findOne({ user: userId })).lean();
  if (!patient) throw new HttpError(404, NOT_FOUND);
  return patient;
}

async function create({ firstName, lastName, email, password, birthDate, phone }) {
  const date = checkBirthDate(birthDate);
  const user = await userService.createUser({ email, password, firstName, lastName, role: 'patient' });
  try {
    return await Patient.create({ user: user.id, birthDate: date, phone });
  } catch (err) {
    await User.deleteOne({ _id: user.id }); // no orphan account if the profile cannot be saved
    if (err.name === 'ValidationError') throw new HttpError(422, 'Les informations du patient sont invalides.');
    throw err;
  }
}

async function update(id, { firstName, lastName, email, password, birthDate, phone }) {
  const patient = await Patient.findById(id);
  if (!patient) throw new HttpError(404, NOT_FOUND);
  const date = checkBirthDate(birthDate);
  const user = await userService.updateUser(patient.user, { email, password, firstName, lastName });
  Object.assign(patient, { birthDate: date, phone });
  await patient.save();
  return { patient, user };
}

async function remove(id) {
  const patient = await get(id);
  await Patient.deleteOne({ _id: id });
  await User.deleteOne({ _id: patient.user._id });
  return patient;
}

module.exports = { list, get, getByUser, create, update, remove };
