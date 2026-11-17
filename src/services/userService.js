const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const HttpError = require('../utils/httpError');

const config = require('../config/env');

const MIN_PASSWORD_LENGTH = 8;

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(422, `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`, 'password');
  }
}

function translate(err) {
  if (err.code === 11000) return new HttpError(409, 'Cette adresse e-mail est déjà utilisée.', 'email');
  if (err.name === 'ValidationError') return new HttpError(422, "Les informations de l'utilisateur sont invalides.");
  return err;
}

async function createUser({ email, password, role, firstName, lastName }) {
  checkPassword(password);
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  try {
    return await User.create({ email, passwordHash, role, firstName, lastName });
  } catch (err) {
    throw translate(err);
  }
}

// `password` is optional: leave it empty to keep the current one.
async function updateUser(id, { email, password, firstName, lastName }) {
  const user = await User.findById(id).select('+passwordHash');
  if (!user) throw new HttpError(404, 'Utilisateur introuvable.');
  if (password) {
    checkPassword(password);
    user.passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  }
  Object.assign(user, { email, firstName, lastName });
  try {
    return await user.save();
  } catch (err) {
    throw translate(err);
  }
}

async function setActive(id, active) {
  const result = await User.updateOne({ _id: id }, { active });
  if (!result.matchedCount) throw new HttpError(404, 'Utilisateur introuvable.');
}

const collator = new Intl.Collator('fr', { sensitivity: 'base' });

async function listAll() {
  const users = await User.find().lean();
  return users.sort((a, b) => collator.compare(`${a.lastName} ${a.firstName}`, `${b.lastName} ${b.firstName}`));
}

// Alias expected by the admin users tests.
const list = listAll;

async function get(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Utilisateur introuvable.');
  const user = await User.findById(id).lean();
  if (!user) throw new HttpError(404, 'Utilisateur introuvable.');
  return user;
}

// Admin accounts are switched on and off here. Doctors and patients are handled in their own sections
// because their appointments must be taken into account.
async function setAdminActive(actorId, id, active) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Utilisateur introuvable.');
  const target = await User.findById(id);
  if (!target) throw new HttpError(404, 'Utilisateur introuvable.');
  if (target.role !== 'admin') {
    throw new HttpError(409, 'Les comptes des médecins et des patients se gèrent depuis leur section.');
  }
  if (!active) {
    if (String(target._id) === String(actorId)) throw new HttpError(409, 'Vous ne pouvez pas désactiver votre propre compte.');
    const otherActive = await User.countDocuments({ role: 'admin', active: true, _id: { $ne: target._id } });
    if (!otherActive) throw new HttpError(409, 'Il doit rester au moins un administrateur actif.');
  }
  target.active = active;
  await target.save();
  // Two admins deactivating each other at the same instant would both pass the check above:
  // verify afterwards and undo if nobody can sign in any more.
  if (!active && (await User.countDocuments({ role: 'admin', active: true })) === 0) {
    target.active = true;
    await target.save();
    throw new HttpError(409, 'Il doit rester au moins un administrateur actif.');
  }
  return target;
}

module.exports = { createUser, updateUser, setActive, listAll, list, get, setAdminActive, MIN_PASSWORD_LENGTH };
