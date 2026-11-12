const patientService = require('../services/patientService');
const User = require('../models/User');
const { startSession } = require('./authController');
const { pick, toErrors, isFormError } = require('./patientController');
const { fieldErrors } = require('../validators/common');
const { toInputDate } = require('../utils/dates');

function renderRegister(res, status, values, errors = {}) {
  res.status(status).render('pages/account/register', { title: 'Créer un compte', values, errors });
}

function showRegister(req, res) {
  renderRegister(res, 200, pick({}));
}

async function register(req, res, next) {
  const values = pick(req.body);
  const errors = fieldErrors(req);
  if (Object.keys(errors).length) return renderRegister(res, 422, values, errors);
  try {
    const patient = await patientService.create({ ...values, password: req.body.password });
    const user = await User.findById(patient.user);
    return startSession(req, res, next, user, `Bienvenue, ${user.firstName}. Votre compte a été créé.`);
  } catch (err) {
    if (isFormError(err)) return renderRegister(res, err.status, values, toErrors(err));
    return next(err);
  }
}

function renderProfile(res, status, values, errors = {}) {
  res.status(status).render('pages/account/profile', { title: 'Mon profil', values, errors });
}

async function showProfile(req, res) {
  const patient = await patientService.getByUser(req.session.user.id);
  renderProfile(res, 200, { ...pick(patient.user), birthDate: toInputDate(patient.birthDate), phone: patient.phone });
}

async function updateProfile(req, res) {
  const patient = await patientService.getByUser(req.session.user.id);
  const values = pick(req.body);
  const errors = fieldErrors(req);
  if (Object.keys(errors).length) return renderProfile(res, 422, values, errors);
  try {
    const { user } = await patientService.update(patient._id, { ...values, password: req.body.password });
    req.session.user.fullName = user.fullName; // keep the header in sync
    req.flash('success', 'Vos informations ont été enregistrées.');
    return res.redirect('/profile');
  } catch (err) {
    if (isFormError(err)) return renderProfile(res, err.status, values, toErrors(err));
    throw err;
  }
}

module.exports = { showRegister, register, showProfile, updateProfile };
