const appointmentService = require('../../services/appointmentService');
const HttpError = require('../../utils/httpError');
const config = require('../../config/env');
const { appointmentDto } = require('../../utils/serializers');
const { today, dayRange } = require('../../utils/time');

const currentUser = (req) => req.session.user;
const text = (value) => (value === undefined || value === null ? '' : String(value).trim());
const dto = async (req, id) => appointmentDto(await appointmentService.getOne(currentUser(req), id));

async function list(req, res) {
  const { upcoming, history } = await appointmentService.listFor(currentUser(req));
  res.json({ timezone: config.clinicTimezone, upcoming: upcoming.map(appointmentDto), history: history.map(appointmentDto) });
}

async function day(req, res) {
  const requested = req.query.date;
  const date = requested === undefined || requested === '' ? today() : requested;
  if (typeof date !== 'string' || !dayRange(date)) {
    throw HttpError.validation({ date: 'Date invalide (format AAAA-MM-JJ).' });
  }
  const appointments = await appointmentService.listForDay(currentUser(req), date);
  res.json({ timezone: config.clinicTimezone, date, appointments: appointments.map(appointmentDto) });
}

async function show(req, res) {
  res.json({ appointment: await dto(req, req.params.id) });
}

async function book(req, res) {
  const created = await appointmentService.book(currentUser(req).id, req.body.slot, text(req.body.reason));
  res.status(201).json({ appointment: await dto(req, created.id) });
}

// Omit `slot` to keep the current one; omit `reason` to keep the current reason.
async function modify(req, res) {
  const user = currentUser(req);
  const current = await appointmentService.getOne(user, req.params.id);
  const reason = req.body.reason === undefined ? current.reason : text(req.body.reason);
  await appointmentService.modify(user, req.params.id, { slotId: req.body.slot, reason });
  res.json({ appointment: await dto(req, req.params.id) });
}

async function cancel(req, res) {
  await appointmentService.cancel(currentUser(req), req.params.id);
  res.json({ appointment: await dto(req, req.params.id) });
}

module.exports = { list, day, show, book, modify, cancel };
