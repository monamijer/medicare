const bcrypt = require('bcryptjs');
const User = require('../models/User');
const HttpError = require('../utils/httpError');

const SALT_ROUNDS = 10;
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
  if (!user) throw new HttpError(404, 'Utilisateur introuvable.');
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

module.exports = { createUser, updateUser, MIN_PASSWORD_LENGTH };
