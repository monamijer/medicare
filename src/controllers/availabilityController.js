const availabilityService = require('../services/availabilityService');
const doctorService = require('../services/doctorService');
const HttpError = require('../utils/httpError');
const { fieldErrors } = require('../validators/common');
const { toLocalParts } = require('../utils/time');
const { groupSlotsByDay } = require('../utils/slotGroups');

const isAdmin = (req) => req.session.user.role === 'admin';
const doctorName = (doctor) => `${doctor.user.firstName} ${doctor.user.lastName}`;
const toErrors = (err) => (err.field ? { [err.field]: err.message } : { form: err.message });
const isFormError = (err) => err.status === 409 || err.status === 422;

// A doctor works on their own slots; an admin picks the doctor with ?doctor=<id>.
async function resolveDoctor(req) {
  if (!isAdmin(req)) return doctorService.getByUser(req.session.user.id);
  const id = req.query.doctor || (req.body && req.body.doctor);
  return id ? doctorService.get(id) : null;
}

const listUrl = (req, doctor) => (isAdmin(req) ? `/availability?doctor=${doctor._id}` : '/availability');

// A doctor can only reach their own slots (404 otherwise, so ids do not leak).
async function loadSlot(req) {
  const slot = await availabilityService.get(req.params.id);
  if (isAdmin(req)) return { slot, doctor: await doctorService.get(slot.doctor) };
  const doctor = await doctorService.getByUser(req.session.user.id);
  if (String(slot.doctor) !== String(doctor._id)) throw new HttpError(404, 'Créneau introuvable.');
  return { slot, doctor };
}

function renderForm(res, status, { doctor, slot = null, values, errors = {} }) {
  res.status(status).render('pages/availability/form', {
    title: slot ? 'Modifier le créneau' : 'Ajouter des disponibilités',
    doctor, slot, values, errors,
    doctorName: doctorName(doctor),
    today: toLocalParts(new Date()).date,
  });
}

const pick = (body) => ({
  date: (body.date || '').trim(), from: (body.from || '').trim(), to: (body.to || '').trim(), duration: (body.duration || '30').trim(),
});

async function index(req, res) {
  const doctor = await resolveDoctor(req);
  if (!doctor) {
    return res.render('pages/availability/choose', { title: 'Disponibilités', doctors: await doctorService.list() });
  }
  const slots = await availabilityService.listUpcoming(doctor._id);
  return res.render('pages/availability/index', {
    title: 'Disponibilités', doctor, doctorName: doctorName(doctor), groups: groupSlotsByDay(slots), total: slots.length,
    admin: isAdmin(req),
  });
}

async function newForm(req, res) {
  const doctor = await resolveDoctor(req);
  if (!doctor) return res.redirect('/availability');
  return renderForm(res, 200, { doctor, values: { date: '', from: '09:00', to: '12:00', duration: '30' } });
}

async function create(req, res) {
  const doctor = await resolveDoctor(req);
  if (!doctor) return res.redirect('/availability');
  const values = pick(req.body);
  const errors = fieldErrors(req);
  if (Object.keys(errors).length) return renderForm(res, 422, { doctor, values, errors });
  try {
    const count = await availabilityService.createRange(doctor._id, values);
    req.flash('success', count === 1 ? '1 créneau ajouté.' : `${count} créneaux ajoutés.`);
    return res.redirect(listUrl(req, doctor));
  } catch (err) {
    if (isFormError(err)) return renderForm(res, err.status, { doctor, values, errors: toErrors(err) });
    throw err;
  }
}

async function editForm(req, res) {
  const { slot, doctor } = await loadSlot(req);
  const start = toLocalParts(slot.start);
  const values = { date: start.date, from: start.time, to: toLocalParts(slot.end).time };
  return renderForm(res, 200, { doctor, slot, values });
}

async function update(req, res) {
  const { slot, doctor } = await loadSlot(req);
  const values = pick(req.body);
  const errors = fieldErrors(req);
  if (Object.keys(errors).length) return renderForm(res, 422, { doctor, slot, values, errors });
  try {
    await availabilityService.update(req.params.id, values);
    req.flash('success', 'Créneau modifié.');
    return res.redirect(listUrl(req, doctor));
  } catch (err) {
    if (isFormError(err)) return renderForm(res, err.status, { doctor, slot, values, errors: toErrors(err) });
    throw err;
  }
}

async function remove(req, res) {
  const { doctor } = await loadSlot(req);
  try {
    await availabilityService.remove(req.params.id);
    req.flash('success', 'Créneau supprimé.');
  } catch (err) {
    if (err.status !== 409) throw err;
    req.flash('danger', err.message);
  }
  res.redirect(listUrl(req, doctor));
}

module.exports = { index, newForm, create, editForm, update, remove };
