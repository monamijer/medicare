const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const HttpError = require('../utils/httpError');

const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
const NOT_FOUND = 'Utilisateur introuvable.';
const collator = new Intl.Collator('fr', { sensitivity: 'base' });

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

async function list() {
  const users = await User.find().lean();
  return users.sort((a, b) => collator.compare(`${a.lastName} ${a.firstName}`, `${b.lastName} ${b.firstName}`));
}

async function get(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, NOT_FOUND);
  const user = await User.findById(id).lean();
  if (!user) throw new HttpError(404, NOT_FOUND);
  return user;
}

async function createUser({ email, password, role, firstName, lastName }) {
  checkPassword(password);
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  try {
    return await User.create({ email, passwordHash, role, firstName, lastName });
  } catch (err) {
    throw translate(err);
  }
}

// `password` is optional: leave it empty to keep the current one.
async function updateUser(id, { email, password, firstName, lastName }) {
  const user = await User.findById(id).select('+passwordHash');
  if (!user) throw new HttpError(404, NOT_FOUND);
  if (password) {
    checkPassword(password);
    user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
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
  if (!result.matchedCount) throw new HttpError(404, NOT_FOUND);
}

module.exports = { list, get, createUser, updateUser, setActive, MIN_PASSWORD_LENGTH };
