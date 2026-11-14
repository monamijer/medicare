const mongoose = require('mongoose');
const appointmentService = require('../services/appointmentService');
const doctorService = require('../services/doctorService');
const specialtyService = require('../services/specialtyService');
const { fieldErrors } = require('../validators/common');
const { groupSlotsByDay } = require('../utils/slotGroups');
const { formatDay, formatTime, zonedToUtc, addDays, today, dayRange } = require('../utils/time');

const doctorName = (doctor) => `${doctor.user.firstName} ${doctor.user.lastName}`;

async function search(req, res) {
  const specialties = await specialtyService.list();
  const selected = mongoose.isValidObjectId(req.query.specialty) ? String(req.query.specialty) : '';
  const results = selected ? await appointmentService.searchDoctors(selected) : null;
  res.render('pages/appointments/search', { title: 'Prendre rendez-vous', specialties, selected, results });
}

async function doctorSlots(req, res) {
  const doctor = await doctorService.get(req.params.doctorId);
  const slots = await appointmentService.listFreeSlots(doctor._id);
  res.render('pages/appointments/slots', {
    title: `Disponibilités de ${doctorName(doctor)}`, doctor, doctorName: doctorName(doctor), groups: groupSlotsByDay(slots),
    specialtyId: String(doctor.specialty._id),
  });
}

async function renderBook(res, status, slot, { reason = '', errors = {} } = {}) {
  const doctor = await doctorService.get(slot.doctor);
  res.status(status).render('pages/appointments/book', {
    title: 'Confirmer le rendez-vous', slot, doctor, doctorName: doctorName(doctor),
    day: formatDay(slot.start), time: `${formatTime(slot.start)} – ${formatTime(slot.end)}`, reason, errors,
  });
}

async function bookForm(req, res) {
  try {
    await renderBook(res, 200, await appointmentService.getBookableSlot(req.params.slotId));
  } catch (err) {
    if (err.status !== 409) throw err;
    req.flash('danger', err.message);
    res.redirect('/appointments/new');
  }
}

async function book(req, res) {
  const errors = fieldErrors(req);
  const reason = (req.body.reason || '').trim();
  if (errors.slot) {
    req.flash('danger', errors.slot);
    return res.redirect('/appointments/new');
  }
  if (Object.keys(errors).length) {
    return renderBook(res, 422, await appointmentService.getBookableSlot(req.body.slot), { reason, errors });
  }
  try {
    const appointment = await appointmentService.book(req.session.user.id, req.body.slot, reason);
    req.flash('success', `Rendez-vous confirmé le ${formatDay(appointment.start)} à ${formatTime(appointment.start)}.`);
    return res.redirect('/appointments');
  } catch (err) {
    if (err.status !== 409) throw err;
    req.flash('danger', err.message);
    return res.redirect('/appointments/new');
  }
}

async function index(req, res) {
  const { upcoming, history } = await appointmentService.listFor(req.session.user);
  res.render('pages/appointments/index', {
    title: req.session.user.role === 'patient' ? 'Mes rendez-vous' : 'Rendez-vous', upcoming, history, role: req.session.user.role,
  });
}

async function cancel(req, res) {
  try {
    await appointmentService.cancel(req.session.user, req.params.id);
    req.flash('success', 'Rendez-vous annulé. Le créneau est de nouveau disponible.');
  } catch (err) {
    if (err.status !== 409) throw err;
    req.flash('danger', err.message);
  }
  res.redirect('/appointments');
}

async function renderModify(res, status, data, { slot, reason, errors = {} } = {}) {
  const { appointment, freeSlots } = data;
  res.status(status).render('pages/appointments/edit', {
    title: 'Modifier le rendez-vous',
    appointment,
    doctorName: doctorName(appointment.doctor),
    currentDay: formatDay(appointment.start),
    currentTime: `${formatTime(appointment.start)} – ${formatTime(appointment.end)}`,
    groups: groupSlotsByDay(freeSlots),
    selected: slot || String(appointment.slot),
    reason: reason === undefined ? appointment.reason : reason,
    errors,
  });
}

async function modifyForm(req, res) {
  try {
    await renderModify(res, 200, await appointmentService.getForModify(req.session.user, req.params.id));
  } catch (err) {
    if (err.status !== 409) throw err;
    req.flash('danger', err.message);
    res.redirect('/appointments');
  }
}

async function modify(req, res) {
  const errors = fieldErrors(req);
  if (errors.slot) {
    req.flash('danger', errors.slot);
    return res.redirect(`/appointments/${req.params.id}/edit`);
  }
  const reason = (req.body.reason || '').trim();
  try {
    if (Object.keys(errors).length) {
      const data = await appointmentService.getForModify(req.session.user, req.params.id);
      return await renderModify(res, 422, data, { slot: req.body.slot, reason, errors });
    }
    const appointment = await appointmentService.modify(req.session.user, req.params.id, { slotId: req.body.slot, reason });
    req.flash('success', `Rendez-vous modifié : ${formatDay(appointment.start)} à ${formatTime(appointment.start)}.`);
    return res.redirect('/appointments');
  } catch (err) {
    if (err.status !== 409 && err.status !== 422) throw err;
    req.flash('danger', err.message);
    return res.redirect(`/appointments/${req.params.id}/edit`);
  }
}

// Daily agenda for doctors (their own) and admins (everyone).
async function day(req, res) {
  const requested = req.query.date;
  const date = requested === undefined || requested === '' ? today() : requested; // empty field = today
  if (typeof date !== 'string' || !dayRange(date)) {
    req.flash('danger', 'Date invalide.');
    return res.redirect('/appointments/day');
  }
  const appointments = await appointmentService.listForDay(req.session.user, date);
  return res.render('pages/appointments/day', {
    title: 'Agenda du jour',
    date,
    label: formatDay(zonedToUtc(date, '12:00')),
    previous: addDays(date, -1),
    next: addDays(date, 1),
    isToday: date === today(),
    appointments,
    role: req.session.user.role,
  });
}

module.exports = { search, doctorSlots, bookForm, book, index, cancel, modifyForm, modify, day };
