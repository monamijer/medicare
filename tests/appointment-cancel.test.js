const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const Appointment = require('../src/models/Appointment');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const Slot = require('../src/models/AvailabilitySlot');
const User = require('../src/models/User');
const { createUser } = require('./helpers/fixtures');
const clinicHelpers = require('./helpers/clinic');

const { closeAll, makeSpecialties, makeDoctor, makePatient, makeSlot, book, loginStaff } = clinicHelpers(app);
let cardio;

test.before(async () => {
  await db.connect();
  await Promise.all([User.init(), Doctor.init(), Patient.init(), Slot.init(), Appointment.init()]);
});
test.beforeEach(async () => {
  await db.clear();
  [cardio] = await makeSpecialties();
});
test.afterEach(closeAll);
test.after(db.close);

const cancel = (client, appointment) => client.request(`/appointments/${appointment.id}/cancel`, { method: 'POST' });

// A doctor with one booked appointment for the patient "Jean".
async function setup() {
  const doctor = await makeDoctor('Abel', cardio);
  const slot = await makeSlot(doctor, 48);
  const jean = await makePatient('Jean');
  await book(jean.client, slot);
  const appointment = await Appointment.findOne();
  return { doctor, slot, jean, appointment };
}

test('a patient cancels their appointment: it is kept as history and the slot is freed', async () => {
  const { jean, slot, appointment } = await setup();
  assert.match((await jean.client.request('/appointments')).html, /Annuler/);

  const res = await cancel(jean.client, appointment);
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/appointments');

  const saved = await Appointment.findById(appointment.id);
  assert.strictEqual(saved.status, 'cancelled');
  assert.strictEqual(saved.cancelledBy, 'patient');
  assert.ok(saved.cancelledAt);
  assert.strictEqual((await Slot.findById(slot.id)).status, 'free');

  const page = await jean.client.request('/appointments');
  assert.match(page.html, /Rendez-vous annulé/);
  assert.match(page.html, /Annulé/);
  assert.match(page.html, /par vous/);
  assert.doesNotMatch(page.html, /\/cancel"/); // no cancel button left
});

test('a freed slot can be booked again; the cancelled appointment stays in the history', async () => {
  const { slot, jean, appointment } = await setup();
  await cancel(jean.client, appointment);
  const marie = await makePatient('Marie');
  assert.strictEqual((await book(marie.client, slot)).location, '/appointments');
  assert.strictEqual(await Appointment.countDocuments({ slot: slot.id, status: 'confirmed' }), 1);
  assert.strictEqual(await Appointment.countDocuments({ slot: slot.id, status: 'cancelled' }), 1);
  assert.strictEqual((await Slot.findById(slot.id)).status, 'booked');
});

test('cancelling twice never frees a slot that someone else has re-booked', async () => {
  const { slot, jean, appointment } = await setup();
  await cancel(jean.client, appointment);
  const marie = await makePatient('Marie');
  await book(marie.client, slot);

  const again = await cancel(jean.client, appointment);
  assert.strictEqual(again.status, 302);
  assert.match((await jean.client.request('/appointments')).html, /déjà annulé/);
  assert.strictEqual((await Slot.findById(slot.id)).status, 'booked');
  assert.strictEqual(await Appointment.countDocuments({ status: 'confirmed' }), 1);
});

test('simultaneous cancellations cancel once and leave the slot free', async () => {
  const { slot, jean, appointment } = await setup();
  await Promise.all([cancel(jean.client, appointment), cancel(jean.client, appointment), cancel(jean.client, appointment)]);
  assert.strictEqual(await Appointment.countDocuments({ status: 'cancelled' }), 1);
  assert.strictEqual((await Slot.findById(slot.id)).status, 'free');
});

test('the doctor can cancel and the patient is told who did it', async () => {
  const { jean, slot, appointment } = await setup();
  const doctor = await loginStaff('abel');
  assert.strictEqual((await cancel(doctor, appointment)).status, 302);
  assert.strictEqual((await Appointment.findById(appointment.id)).cancelledBy, 'doctor');
  assert.strictEqual((await Slot.findById(slot.id)).status, 'free');
  assert.match((await jean.client.request('/appointments')).html, /par le médecin/);
  assert.match((await doctor.request('/appointments')).html, /par vous/);
});

test('an admin can cancel any appointment', async () => {
  const { appointment, slot } = await setup();
  await createUser('admin');
  const admin = await loginStaff('admin');
  assert.strictEqual((await cancel(admin, appointment)).status, 302);
  assert.strictEqual((await Appointment.findById(appointment.id)).cancelledBy, 'admin');
  assert.strictEqual((await Slot.findById(slot.id)).status, 'free');
});

test('people cannot cancel appointments that are not theirs', async () => {
  const { appointment, slot } = await setup();
  const marie = await makePatient('Marie');
  const other = await makeDoctor('Zola', cardio);
  const otherDoctor = await loginStaff('zola');
  for (const client of [marie.client, otherDoctor]) {
    assert.strictEqual((await cancel(client, appointment)).status, 404);
  }
  assert.strictEqual((await Appointment.findById(appointment.id)).status, 'confirmed');
  assert.strictEqual((await Slot.findById(slot.id)).status, 'booked');
  assert.ok(other);
});

test('a past appointment cannot be cancelled', async () => {
  const doctor = await makeDoctor('Abel', cardio);
  const slot = await makeSlot(doctor, -5, 30, 'booked');
  const jean = await makePatient('Jean');
  const patient = await Patient.findOne();
  const past = await Appointment.create({ slot: slot.id, doctor: doctor.id, patient: patient.id, start: slot.start, end: slot.end });

  const res = await cancel(jean.client, past);
  assert.strictEqual(res.status, 302);
  const page = await jean.client.request('/appointments');
  assert.match(page.html, /est passé/);
  assert.match(page.html, /Terminé/);
  assert.strictEqual((await Appointment.findById(past.id)).status, 'confirmed');
  assert.strictEqual((await Slot.findById(slot.id)).status, 'booked');
});

test('unknown ids give 404 and anonymous users are redirected to login', async () => {
  await setup();
  const jean = await makePatient('Paul');
  for (const id of ['64b7f0c2a1b2c3d4e5f60718', 'bad']) {
    assert.strictEqual((await jean.client.request(`/appointments/${id}/cancel`, { method: 'POST' })).status, 404);
  }
  const anon = clinicHelpers(app);
  const res = await anon.newClient().request('/appointments/64b7f0c2a1b2c3d4e5f60718/cancel', { method: 'POST' });
  anon.closeAll();
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/login');
});
