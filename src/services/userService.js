const bcrypt = require('bcryptjs');
const User = require('../models/User');
const HttpError = require('../utils/httpError');

const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

async function createUser({ email, password, role, firstName, lastName }) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(422, `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  try {
    return await User.create({ email, passwordHash, role, firstName, lastName });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'Cette adresse e-mail est déjà utilisée.');
    if (err.name === 'ValidationError') throw new HttpError(422, 'Les informations de l\'utilisateur sont invalides.');
    throw err;
  }
}

module.exports = { createUser, MIN_PASSWORD_LENGTH };
