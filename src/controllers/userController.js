const userService = require('../services/userService');
const { fieldErrors } = require('../validators/common');
const { ROLE_LABELS } = require('../utils/navigation');

// Doctor and patient accounts are managed from their own sections (they need a profile).
// This section creates and edits administrator accounts, and lists everyone.
const FIELDS = ['firstName', 'lastName', 'email'];
const pick = (body) => Object.fromEntries(FIELDS.map((f) => [f, (body[f] || '').toString().trim()]));
const toErrors = (err) => (err.field ? { [err.field]: err.message } : { form: err.message });
const isFormError = (err) => err.status === 409 || err.status === 422;
const fullName = (user) => `${user.firstName} ${user.lastName}`;

function renderForm(res, status, { account = null, values, errors = {} }) {
  res.status(status).render('pages/users/form', {
    title: account ? "Modifier l'administrateur" : 'Nouvel administrateur',
    account,
    values,
    errors,
  });
}

// Returns true (after redirecting) when the account is not an administrator.
function refuseUnmanaged(req, res, account) {
  if (account.role === 'admin') return false;
  const section = account.role === 'doctor' ? 'Médecins' : 'Patients';
  req.flash('danger', `Ce compte se gère depuis la section « ${section} ».`);
  res.redirect('/users');
  return true;
}

async function index(req, res) {
  res.render('pages/users/index', { title: 'Utilisateurs', users: await userService.list(), roleLabels: ROLE_LABELS });
}

function newForm(req, res) {
  renderForm(res, 200, { values: pick({}) });
}

async function create(req, res) {
  const values = pick(req.body);
  const errors = fieldErrors(req);
  if (Object.keys(errors).length) return renderForm(res, 422, { values, errors });
  try {
    const user = await userService.createUser({ ...values, password: req.body.password, role: 'admin' });
    req.flash('success', `Administrateur « ${user.fullName} » créé.`);
    return res.redirect('/users');
  } catch (err) {
    if (isFormError(err)) return renderForm(res, err.status, { values, errors: toErrors(err) });
    throw err;
  }
}

async function editForm(req, res) {
  const account = await userService.get(req.params.id);
  if (refuseUnmanaged(req, res, account)) return undefined;
  return renderForm(res, 200, { account, values: pick(account) });
}

async function update(req, res) {
  const account = await userService.get(req.params.id);
  if (refuseUnmanaged(req, res, account)) return undefined;
  const values = pick(req.body);
  const errors = fieldErrors(req);
  if (Object.keys(errors).length) return renderForm(res, 422, { account, values, errors });
  try {
    const updated = await userService.updateUser(req.params.id, { ...values, password: req.body.password });
    if (updated.id === req.session.user.id) {
      Object.assign(req.session.user, { firstName: updated.firstName, fullName: updated.fullName }); // keep header in sync
    }
    req.flash('success', `Administrateur « ${updated.fullName} » modifié.`);
    return res.redirect('/users');
  } catch (err) {
    if (isFormError(err)) return renderForm(res, err.status, { account, values, errors: toErrors(err) });
    throw err;
  }
}

async function changeActive(req, res, active) {
  const account = await userService.get(req.params.id);
  if (refuseUnmanaged(req, res, account)) return;
  if (!active && String(account._id) === req.session.user.id) {
    req.flash('danger', 'Vous ne pouvez pas désactiver votre propre compte.');
    return res.redirect('/users');
  }
  await userService.setActive(account._id, active);
  req.flash('success', active ? `Compte « ${fullName(account)} » réactivé.` : `Compte « ${fullName(account)} » désactivé : connexion impossible.`);
  res.redirect('/users');
}

const deactivate = (req, res) => changeActive(req, res, false);
const reactivate = (req, res) => changeActive(req, res, true);

module.exports = { index, newForm, create, editForm, update, deactivate, reactivate };
