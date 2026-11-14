const userService = require('../services/userService');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const { fieldErrors } = require('../validators/common');

const FIELDS = ['firstName', 'lastName', 'email'];
const pick = (body) => Object.fromEntries(FIELDS.map((f) => [f, (body[f] || '').toString().trim()]));
const toErrors = (err) => (err.field ? { [err.field]: err.message } : { form: err.message });

async function index(req, res) {
  const users = await userService.listAll();
  const ids = users.map((u) => u._id);
  const [doctors, patients] = await Promise.all([
    Doctor.find({ user: { $in: ids } }).select('user').lean(),
    Patient.find({ user: { $in: ids } }).select('user').lean(),
  ]);
  const profile = new Map();
  doctors.forEach((d) => profile.set(String(d.user), `/doctors/${d._id}`));
  patients.forEach((p) => profile.set(String(p.user), `/patients/${p._id}`));
  res.render('pages/users/index', {
    title: 'Utilisateurs',
    users: users.map((u) => ({ ...u, profileUrl: profile.get(String(u._id)) || null, isSelf: String(u._id) === req.session.user.id })),
  });
}

function newForm(req, res) {
  res.render('pages/users/form', { title: 'Nouvel administrateur', values: pick({}), errors: {} });
}

async function create(req, res) {
  const values = pick(req.body);
  const errors = fieldErrors(req);
  const render = (status, errs) => res.status(status).render('pages/users/form', { title: 'Nouvel administrateur', values, errors: errs });
  if (Object.keys(errors).length) return render(422, errors);
  try {
    const user = await userService.createUser({ ...values, password: req.body.password, role: 'admin' });
    req.flash('success', `Administrateur « ${user.fullName} » créé.`);
    return res.redirect('/users');
  } catch (err) {
    if (err.status === 409 || err.status === 422) return render(err.status, toErrors(err));
    throw err;
  }
}

async function setActive(req, res, active) {
  try {
    const user = await userService.setAdminActive(req.session.user.id, req.params.id, active);
    req.flash('success', `Compte « ${user.fullName} » ${active ? 'réactivé' : 'désactivé'}.`);
  } catch (err) {
    if (err.status !== 409) throw err;
    req.flash('danger', err.message);
  }
  res.redirect('/users');
}

module.exports = {
  index, newForm, create,
  deactivate: (req, res) => setActive(req, res, false),
  reactivate: (req, res) => setActive(req, res, true),
};
