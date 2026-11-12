const bcrypt = require('bcryptjs');
const User = require('../models/User');
const HttpError = require('../utils/httpError');

const INVALID_CREDENTIALS = 'Adresse e-mail ou mot de passe incorrect.';
// Compared when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

async function authenticate(email, password) {
  const user = await User.findOne({ email: String(email || '').trim().toLowerCase() }).select('+passwordHash');
  const matches = await bcrypt.compare(String(password || ''), user ? user.passwordHash : DUMMY_HASH);
  if (!user || !matches || !user.active) throw new HttpError(401, INVALID_CREDENTIALS);
  return user;
}

module.exports = { authenticate };
