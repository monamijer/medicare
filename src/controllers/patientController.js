const patientService = require('../services/patientService');
const { fieldErrors } = require('../validators/common');
const { toInputDate } = require('../utils/dates');

const FIELDS = ['firstName', 'lastName', 'email', 'birthDate', 'phone'];
const pick = (body) => Object.fromEntries(FIELDS.map((f) => [f, (body[f] || '').toString().trim()]));
const toErrors = (err) => (err.field ? { [err.field]: err.message } : { form: err.message });
const isFormError = (err) => err.status === 409 || err.status === 422;
const fullName = (patient) => `${patient.user.firstName} ${patient.user.lastName}`;

function renderForm(res, status, { patient = null, values, errors = {} }) {
  res.status(status).render('pages/patients/form', {
    title: patient ? 'Modifier le patient' : 'Nouveau patient',
    patient,
    values,
    errors,
  });
}

async function index(req, res) {
  res.render('pages/patients/index', { title: 'Patients', patients: await patientService.list() });
}

async function show(req, res) {
  const patient = await patientService.get(req.params.id);
  res.render('pages/patients/show', { title: fullName(patient), patient });
}

function newForm(req, res) {
  renderForm(res, 200, { values: pick({}) });
}

async function create(req, res) {
  const values = pick(req.body);
  const errors = fieldErrors(req);
  if (Object.keys(errors).length) return renderForm(res, 422, { values, errors });
  try {
    const patient = await patientService.create({ ...values, password: req.body.password });
    req.flash('success', 'Patient créé.');
    return res.redirect(`/patients/${patient.id}`);
  } catch (err) {
    if (isFormError(err)) return renderForm(res, err.status, { values, errors: toErrors(err) });
    throw err;
  }
}

async function editForm(req, res) {
  const patient = await patientService.get(req.params.id);
  const values = { ...pick(patient.user), birthDate: toInputDate(patient.birthDate), phone: patient.phone };
  renderForm(res, 200, { patient, values });
}

async function update(req, res) {
  const patient = await patientService.get(req.params.id);
  const values = pick(req.body);
  const errors = fieldErrors(req);
  if (Object.keys(errors).length) return renderForm(res, 422, { patient, values, errors });
  try {
    await patientService.update(req.params.id, { ...values, password: req.body.password });
    req.flash('success', 'Patient modifié.');
    return res.redirect(`/patients/${req.params.id}`);
  } catch (err) {
    if (isFormError(err)) return renderForm(res, err.status, { patient, values, errors: toErrors(err) });
    throw err;
  }
}

async function remove(req, res) {
  const patient = await patientService.remove(req.params.id);
  req.flash('success', `Patient « ${fullName(patient)} » supprimé.`);
  res.redirect('/patients');
}

module.exports = { index, show, newForm, create, editForm, update, remove, pick, toErrors, isFormError };
