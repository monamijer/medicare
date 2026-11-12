const mongoose = require('mongoose');
const Specialty = require('../models/Specialty');
const Doctor = require('../models/Doctor');
const HttpError = require('../utils/httpError');

const NOT_FOUND = 'Spécialité introuvable.';

function list() {
  return Specialty.find().collation({ locale: 'fr' }).sort({ name: 1 }).lean();
}

async function get(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, NOT_FOUND);
  const specialty = await Specialty.findById(id).lean();
  if (!specialty) throw new HttpError(404, NOT_FOUND);
  return specialty;
}

function translate(err) {
  if (err.code === 11000) return new HttpError(409, 'Cette spécialité existe déjà.');
  if (err.name === 'ValidationError') return new HttpError(422, 'Le nom de la spécialité est invalide.');
  return err;
}

async function create({ name }) {
  try {
    return await Specialty.create({ name });
  } catch (err) {
    throw translate(err);
  }
}

async function update(id, { name }) {
  await get(id);
  try {
    return await Specialty.findByIdAndUpdate(id, { name }, { new: true, runValidators: true });
  } catch (err) {
    throw translate(err);
  }
}

async function remove(id) {
  const specialty = await get(id);
  if (await Doctor.exists({ specialty: id })) {
    throw new HttpError(409, `La spécialité « ${specialty.name} » est utilisée par au moins un médecin et ne peut pas être supprimée.`);
  }
  await Specialty.deleteOne({ _id: id });
  return specialty;
}

module.exports = { list, get, create, update, remove };
