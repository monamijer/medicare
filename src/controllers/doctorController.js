const doctorService = require('../services/doctorService');
const specialtyService = require('../services/specialtyService');
const { fieldErrors } = require('../validators/common');

const FIELDS = ['firstName', 'lastName', 'email', 'specialty', 'licenseNumber', 'phone'];
const pick = (body) => Object.fromEntries(FIELDS.map((f) => [f, (body[f] || '').toString().trim()]));

async function renderForm(res, status, { doctor = null, values, errors = {} }) {
  res.status(status).render('pages/doctors/form', {
    title: doctor ? 'Modifier le médecin' : 'Nouveau médecin',
    doctor,
    values,
    errors,
    specialties: await specialtyService.list(),
  });
}

const toErrors = (err) => (err.field ? { [err.field]: err.message } : { form: err.message });
const isFormError = (err) => err.status === 409 || err.status === 422;
const fullName = (doctor) => `${doctor.user.firstName} ${doctor.user.lastName}`;

async function index(req, res) {
  res.render('pages/doctors/index', { title: 'Médecins', doctors: await doctorService.list() });
}

async function show(req, res) {
  const doctor = await doctorService.get(req.params.id);
  res.render('pages/doctors/show', { title: fullName(doctor), doctor });
}

async function newForm(req, res) {
  await renderForm(res, 200, { values: pick({}) });
}

async function create(req, res) {
  const values = pick(req.body);
  const errors = fieldErrors(req);
  if (Object.keys(errors).length) return renderForm(res, 422, { values, errors });
  try {
    const doctor = await doctorService.create({ ...values, password: req.body.password });
    req.flash('success', 'Médecin créé.');
    return res.redirect(`/doctors/${doctor.id}`);
  } catch (err) {
    if (isFormError(err)) return renderForm(res, err.status, { values, errors: toErrors(err) });
    throw err;
  }
}

async function editForm(req, res) {
  const doctor = await doctorService.get(req.params.id);
  const values = { ...pick(doctor.user), specialty: String(doctor.specialty._id), licenseNumber: doctor.licenseNumber, phone: doctor.phone };
  await renderForm(res, 200, { doctor, values });
}

async function update(req, res) {
  const doctor = await doctorService.get(req.params.id);
  const values = pick(req.body);
  const errors = fieldErrors(req);
  if (Object.keys(errors).length) return renderForm(res, 422, { doctor, values, errors });
  try {
    await doctorService.update(req.params.id, { ...values, password: req.body.password });
    req.flash('success', 'Médecin modifié.');
    return res.redirect(`/doctors/${req.params.id}`);
  } catch (err) {
    if (isFormError(err)) return renderForm(res, err.status, { doctor, values, errors: toErrors(err) });
    throw err;
  }
}

async function remove(req, res) {
  const doctor = await doctorService.remove(req.params.id);
  req.flash('success', `Médecin « ${fullName(doctor)} » supprimé.`);
  res.redirect('/doctors');
}

module.exports = { index, show, newForm, create, editForm, update, remove };
