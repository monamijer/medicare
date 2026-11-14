const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const User = require('../models/User');
const userService = require('./userService');
const { removalPlan } = require('./retention');
const HttpError = require('../utils/httpError');
const { parseBirthDate } = require('../utils/dates');

const NOT_FOUND = 'Patient introuvable.';
const collator = new Intl.Collator('fr', { sensitivity: 'base' });

const populate = (query) => query.populate('user', 'firstName lastName email active');

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
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, NOT_FOUND);
  const patient = await Patient.findById(id);
  if (!patient) throw new HttpError(404, NOT_FOUND);
  const date = checkBirthDate(birthDate);
  const user = await userService.updateUser(patient.user, { email, password, firstName, lastName });
  Object.assign(patient, { birthDate: date, phone });
  await patient.save();
  return { patient, user };
}

// Deletes a patient with no appointment history; deactivates one whose history must be kept;
// refuses while upcoming appointments exist.
async function remove(id) {
  const patient = await get(id);
  const plan = await removalPlan({ patient: patient._id });
  if (plan.action === 'refuse') {
    throw new HttpError(409, `Ce patient a ${plan.upcoming} rendez-vous à venir. Annulez-les avant de le supprimer.`);
  }
  if (plan.action === 'deactivate') {
    await User.updateOne({ _id: patient.user._id }, { active: false });
    return { patient, deactivated: true };
  }
  await Patient.deleteOne({ _id: id });
  await User.deleteOne({ _id: patient.user._id });
  return { patient, deactivated: false };
}

async function reactivate(id) {
  const patient = await get(id);
  await userService.setActive(patient.user._id, true);
  return patient;
}

module.exports = { list, get, getByUser, create, update, remove, reactivate };
