const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const app = require('../src/app');
const Appointment = require('../src/models/Appointment');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const Slot = require('../src/models/AvailabilitySlot');
const User = require('../src/models/User');
const { addDays, today } = require('../src/utils/time');
const { createUser, loginAs } = require('./helpers/fixtures');
const clinicHelpers = require('./helpers/clinic');

const { newClient, closeAll, makeSpecialties, makeDoctor, makePatient, makeSlot, book, loginStaff } = clinicHelpers(app);
let cardio;
let admin;

test.before(async () => {
  await db.connect();
  await Promise.all([User.init(), Doctor.init(), Patient.init(), Slot.init(), Appointment.init()]);
});
test.beforeEach(async () => {
  await db.clear();
  [cardio] = await makeSpecialties();
  await createUser('admin');
  admin = await loginStaff('admin');
});
test.afterEach(closeAll);
test.after(db.close);

const post = (client, path) => client.request(path, { method: 'POST' });
const cancel = (client, appointment) => post(client, `/appointments/${appointment.id}/cancel`);

// Dr Abel + patient Jean with one upcoming booked appointment.
async function setup() {
  const doctor = await makeDoctor('Abel', cardio);
  const slot = await makeSlot(doctor, 48);
  const jean = await makePatient('Jean');
  await book(jean.client, slot);
  return { doctor, slot, jean, appointment: await Appointment.findOne() };
}

// An appointment that already took place (confirmed, but over).
async function pastAppointment(doctor, patient) {
  const slot = await makeSlot(doctor, -5, 30, 'booked');
  return Appointment.create({ slot: slot.id, doctor: doctor.id, patient: patient.id, start: slot.start, end: slot.end });
}

test('a doctor with upcoming appointments cannot be deleted', async () => {
  const { doctor, slot } = await setup();
  const res = await post(admin, `/doctors/${doctor.id}/delete`);
  assert.strictEqual(res.status, 302);
  assert.match((await admin.request('/doctors')).html, /1 rendez-vous à venir/);
  assert.strictEqual(await Doctor.countDocuments(), 1);
  assert.strictEqual((await User.findOne({ email: 'abel@clinique.test' })).active, true);
  assert.strictEqual((await Slot.findById(slot.id)).status, 'booked');
});

test('a doctor with history is deactivated, not deleted: login blocked, hidden from search, history kept', async () => {
  const { doctor, jean, appointment } = await setup();
  await cancel(jean.client, appointment);
  await makeSlot(doctor, 100); // a free slot that must disappear

  await post(admin, `/doctors/${doctor.id}/delete`);
  assert.strictEqual(await Doctor.countDocuments(), 1);
  assert.strictEqual((await User.findOne({ email: 'abel@clinique.test' })).active, false);
  assert.strictEqual(await Slot.countDocuments({ doctor: doctor.id, status: 'free' }), 0);
  assert.strictEqual(await Appointment.countDocuments(), 1);

  const list = (await admin.request('/doctors')).html;
  assert.match(list, /désactivé : son historique/);
  assert.match(list, /Désactivé/);
  assert.match(list, /Réactiver/);
  assert.doesNotMatch(list, /\/doctors\/[0-9a-f]+\/delete/);

  const doctorClient = newClient();
  assert.strictEqual((await loginAs(doctorClient, 'abel@clinique.test')).status, 401);
  assert.doesNotMatch((await jean.client.request(`/appointments/new?specialty=${cardio.id}`)).html, /Dr Abel/);
  const history = (await jean.client.request('/appointments')).html;
  assert.match(history, /Dr Abel/);
  assert.match(history, /Annulé/);
});

test('a doctor whose only appointment is in the past is deactivated', async () => {
  const doctor = await makeDoctor('Abel', cardio);
  const jean = await makePatient('Jean');
  await pastAppointment(doctor, jean.patient);
  await post(admin, `/doctors/${doctor.id}/delete`);
  assert.strictEqual(await Doctor.countDocuments(), 1);
  assert.strictEqual((await User.findOne({ email: 'abel@clinique.test' })).active, false);
  assert.match((await jean.client.request('/appointments')).html, /Terminé/);
});

test('a doctor without any appointment is still deleted for good', async () => {
  const doctor = await makeDoctor('Abel', cardio);
  await makeSlot(doctor, 48);
  await post(admin, `/doctors/${doctor.id}/delete`);
  assert.match((await admin.request('/doctors')).html, /supprimé/);
  assert.strictEqual(await Doctor.countDocuments(), 0);
  assert.strictEqual(await User.countDocuments({ email: 'abel@clinique.test' }), 0);
  assert.strictEqual(await Slot.countDocuments(), 0);
});

test('a deactivated doctor can be reactivated and can log in again', async () => {
  const { doctor, jean, appointment } = await setup();
  await cancel(jean.client, appointment);
  await post(admin, `/doctors/${doctor.id}/delete`);

  assert.match((await admin.request(`/doctors/${doctor.id}`)).html, /Ce compte est désactivé/);
  const res = await post(admin, `/doctors/${doctor.id}/reactivate`);
  assert.strictEqual(res.status, 302);
  assert.strictEqual((await User.findOne({ email: 'abel@clinique.test' })).active, true);
  const doctorClient = newClient();
  assert.strictEqual((await loginAs(doctorClient, 'abel@clinique.test')).status, 302);
  assert.match((await jean.client.request(`/appointments/new?specialty=${cardio.id}`)).html, /Dr Abel/);
  assert.strictEqual((await post(admin, '/doctors/bad/reactivate')).status, 404);
});

test('nothing can be booked with, or added for, a deactivated doctor', async () => {
  const { doctor, jean, appointment } = await setup();
  await cancel(jean.client, appointment);
  await post(admin, `/doctors/${doctor.id}/delete`);

  const stray = await makeSlot(doctor, 72); // e.g. left over from before
  const marie = await makePatient('Marie');
  const res = await book(marie.client, stray);
  assert.strictEqual(res.location, '/appointments/new');
  assert.strictEqual(await Appointment.countDocuments({ status: 'confirmed' }), 0);
  assert.strictEqual((await Slot.findById(stray.id)).status, 'free');
  assert.strictEqual((await marie.client.request(`/appointments/book/${stray.id}`)).status, 302);

  const add = await admin.request(`/availability?doctor=${doctor.id}`, {
    method: 'POST', form: { doctor: String(doctor.id), date: addDays(today(), 9), from: '09:00', to: '10:00', duration: '30' },
  });
  assert.strictEqual(add.status, 409);
  assert.match(add.html, /désactivé/);
});

test('a patient with upcoming appointments cannot be deleted', async () => {
  const { jean } = await setup();
  const res = await post(admin, `/patients/${jean.patient.id}/delete`);
  assert.strictEqual(res.status, 302);
  assert.match((await admin.request('/patients')).html, /1 rendez-vous à venir/);
  assert.strictEqual(await Patient.countDocuments(), 1);
});

test('a patient with history is deactivated; doctors still see the history; reactivation works', async () => {
  const { jean, appointment, doctor } = await setup();
  await cancel(jean.client, appointment);
  await post(admin, `/patients/${jean.patient.id}/delete`);

  assert.strictEqual(await Patient.countDocuments(), 1);
  assert.strictEqual((await User.findOne({ email: 'jean@exemple.test' })).active, false);
  const list = (await admin.request('/patients')).html;
  assert.match(list, /désactivé : son historique/);
  assert.match(list, /Réactiver/);

  const again = newClient();
  assert.strictEqual((await loginAs(again, 'jean@exemple.test')).status, 401);
  assert.strictEqual((await jean.client.request('/appointments')).status, 302); // the old session is dead too
  assert.ok(doctor);
  const doctorView = (await (await loginStaff('abel')).request('/appointments')).html;
  assert.match(doctorView, /Pat Jean/);

  await post(admin, `/patients/${jean.patient.id}/reactivate`);
  assert.strictEqual((await loginAs(newClient(), 'jean@exemple.test')).status, 302);
});

test('a patient whose only appointment is in the past is deactivated; one with none is deleted', async () => {
  const doctor = await makeDoctor('Abel', cardio);
  const jean = await makePatient('Jean');
  const paul = await makePatient('Paul');
  await pastAppointment(doctor, jean.patient);
  await post(admin, `/patients/${jean.patient.id}/delete`);
  await post(admin, `/patients/${paul.patient.id}/delete`);
  assert.strictEqual((await User.findOne({ email: 'jean@exemple.test' })).active, false);
  assert.strictEqual(await Patient.countDocuments({ _id: jean.patient.id }), 1);
  assert.strictEqual(await Patient.countDocuments({ _id: paul.patient.id }), 0);
  assert.strictEqual(await User.countDocuments({ email: 'paul@exemple.test' }), 0);
});

test('appointments pointing at a record that no longer exists do not break the lists', async () => {
  const { jean, doctor, slot } = await setup();
  await Appointment.create({
    slot: slot.id, doctor: new mongoose.Types.ObjectId(), patient: jean.patient.id,
    start: new Date(Date.now() + 5 * 86400000), end: new Date(Date.now() + 5 * 86400000 + 1800000), status: 'cancelled',
  });
  assert.strictEqual((await jean.client.request('/appointments')).status, 200);
  assert.strictEqual((await admin.request('/appointments')).status, 200);
  assert.ok(doctor);
});
