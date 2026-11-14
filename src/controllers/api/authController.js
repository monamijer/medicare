const authService = require('../../services/authService');
const patientService = require('../../services/patientService');
const User = require('../../models/User');
const { establishSession } = require('../../utils/session');
const { userDto } = require('../../utils/serializers');
const { COOKIE_NAME } = require('../../config/session');

async function login(req, res) {
  const user = await authService.authenticate(req.body.email, req.body.password);
  await establishSession(req, user);
  res.json({ user: userDto(user) });
}

function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(COOKIE_NAME);
    return res.status(204).end();
  });
}

async function me(req, res) {
  const user = await User.findById(req.session.user.id);
  res.json({ user: userDto(user) });
}

// Patient self-registration; the new patient is signed in.
async function register(req, res) {
  const { firstName, lastName, email, password, birthDate, phone } = req.body;
  const patient = await patientService.create({ firstName, lastName, email, password, birthDate, phone: phone || '' });
  const user = await User.findById(patient.user);
  await establishSession(req, user);
  res.status(201).json({ user: userDto(user) });
}

module.exports = { login, logout, me, register };
