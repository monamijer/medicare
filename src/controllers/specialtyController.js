const specialtyService = require('../services/specialtyService');
const { fieldErrors } = require('../validators/common');

function renderForm(res, status, { specialty = null, name = '', errors = {} }) {
  res.status(status).render('pages/specialties/form', {
    title: specialty ? 'Modifier la spécialité' : 'Nouvelle spécialité',
    specialty,
    values: { name },
    errors,
  });
}

async function index(req, res) {
  res.render('pages/specialties/index', { title: 'Spécialités', specialties: await specialtyService.list() });
}

function newForm(req, res) {
  renderForm(res, 200, {});
}

async function create(req, res) {
  const name = req.body.name || '';
  const errors = fieldErrors(req);
  if (Object.keys(errors).length) return renderForm(res, 422, { name, errors });
  try {
    const specialty = await specialtyService.create({ name });
    req.flash('success', `Spécialité « ${specialty.name} » créée.`);
    return res.redirect('/specialties');
  } catch (err) {
    if (err.status === 409 || err.status === 422) return renderForm(res, err.status, { name, errors: { name: err.message } });
    throw err;
  }
}

async function editForm(req, res) {
  const specialty = await specialtyService.get(req.params.id);
  renderForm(res, 200, { specialty, name: specialty.name });
}

async function update(req, res) {
  const specialty = await specialtyService.get(req.params.id);
  const name = req.body.name || '';
  const errors = fieldErrors(req);
  if (Object.keys(errors).length) return renderForm(res, 422, { specialty, name, errors });
  try {
    const updated = await specialtyService.update(req.params.id, { name });
    req.flash('success', `Spécialité « ${updated.name} » modifiée.`);
    return res.redirect('/specialties');
  } catch (err) {
    if (err.status === 409 || err.status === 422) return renderForm(res, err.status, { specialty, name, errors: { name: err.message } });
    throw err;
  }
}

async function remove(req, res) {
  const specialty = await specialtyService.remove(req.params.id);
  req.flash('success', `Spécialité « ${specialty.name} » supprimée.`);
  res.redirect('/specialties');
}

module.exports = { index, newForm, create, editForm, update, remove };
