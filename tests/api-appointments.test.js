const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const Appointment = require('../src/models/Appointment');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const Slot = require('../src/models/AvailabilitySlot');
const Specialty = require('../src/models/Specialty');
const User = require('../src/models/User');
const { addDays, today, zonedToUtc } = require('../src/utils/time');
const { createUser } = require('./helpers/fixtures');
const { api, apiLogin } = require('./helpers/api');
const clinicHelpers = require('./helpers/clinic');

const { newClient, closeAll, consistency, makeDoctor, makePatient, makeSlot } = clinicHelpers(app);
let cardio;

test.before(async () => {
  await db.connect();
  await Promise.all([User.init(), Doctor.init(), Patient.init(), Slot.init(), Appointment.init(), Specialty.init()]);
});
test.beforeEach(async () => {
  await db.clear();
  cardio = await Specialty.create({ name: 'Cardiologie' });
});
test.afterEach(closeAll);
test.after(db.close);

async function apiPatient(name) {
  const made = await makePatient(name);
  const client = newClient();
  await apiLogin(client, `${name.toLowerCase()}@exemple.test`);
  return { ...made, client };
}
async function apiStaff(role) {
  if (role === 'admin') await createUser('admin');
  const client = newClient();
  await apiLogin(client, `${role}@clinique.test`);
  return client;
}
const book = (client, slot, reason) => api(client, 'POST', '/appointments', { slot: String(slot.id), ...(reason === undefined ? {} : { reason }) });
const SOME_ID = '64b7f0c2a1b2c3d4e5f60718';

// Dr Abel with slots +48h/+50h/+52h; Jean booked the first.
async function setup() {
  const doctor = await makeDoctor('Abel', cardio);
  const [s1, s2, s3] = [await makeSlot(doctor, 48), await makeSlot(doctor, 50), await makeSlot(doctor, 52)];
  const jean = await apiPatient('Jean');
  const res = await book(jean.client, s1, 'Douleurs');
  return { doctor, s1, s2, s3, jean, appointment: res.json.appointment };
}

test('login is required everywhere, and each role only reaches its own endpoints', async () => {
  const doctor = await makeDoctor('Abel', cardio);
  const jean = await apiPatient('Jean');
  const anonymous = newClient();
  for (const [method, path] of [['GET', '/appointments'], ['GET', '/appointments/day'], ['POST', '/appointments'], ['GET', `/appointments/${SOME_ID}`], ['PUT', `/appointments/${SOME_ID}`], ['POST', `/appointments/${SOME_ID}/cancel`]]) {
    assert.strictEqual((await api(anonymous, method, path, method === 'GET' ? undefined : {})).status, 401, `${method} ${path}`);
  }
  assert.strictEqual((await api(jean.client, 'GET', '/appointments/day')).status, 403);
  const staff = await apiStaff('abel');
  assert.strictEqual((await api(staff, 'POST', '/appointments', { slot: SOME_ID })).status, 403);
  assert.strictEqual((await api(staff, 'PUT', `/appointments/${SOME_ID}`, {})).status, 403);
  assert.ok(doctor);
});

test('a patient books a slot: 201 with the appointment, the doctor\'s public view and no private data', async () => {
  const { doctor, s1, appointment, jean } = await setup();
  assert.deepStrictEqual(Object.keys(appointment).sort(), ['cancelledAt', 'cancelledBy', 'doctor', 'end', 'id', 'patient', 'reason', 'start', 'status']);
  assert.strictEqual(appointment.status, 'confirmed');
  assert.strictEqual(appointment.reason, 'Douleurs');
  assert.strictEqual(appointment.start, s1.start.toISOString());
  assert.strictEqual(appointment.doctor.id, String(doctor.id));
  assert.deepStrictEqual(Object.keys(appointment.doctor).sort(), ['firstName', 'fullName', 'id', 'lastName', 'specialty']);
  assert.strictEqual(appointment.patient.fullName, 'Pat Jean');
  assert.strictEqual((await Slot.findById(s1.id)).status, 'booked');
  const raw = JSON.stringify(appointment);
  assert.doesNotMatch(raw, /abel@clinique|jean@exemple|L-Abel|passwordHash/);
  assert.ok(jean);
});

test('booking refuses taken, past, unknown and malformed slots, bad reasons and double bookings', async () => {
  const doctor = await makeDoctor('Abel', cardio);
  const taken = await makeSlot(doctor, 48, 30, 'booked');
  const past = await makeSlot(doctor, -5);
  const free = await makeSlot(doctor, 60);
  const { client } = await apiPatient('Jean');

  for (const slot of [taken, past]) {
    const res = await book(client, slot);
    assert.strictEqual(res.status, 409);
    assert.match(res.json.error.fields.slot, /plus disponible/);
  }
  assert.strictEqual((await book(client, { id: SOME_ID })).status, 404);
  const malformed = await api(client, 'POST', '/appointments', { slot: 'bad' });
  assert.strictEqual(malformed.status, 422);
  assert.ok(malformed.json.error.fields.slot);
  assert.strictEqual((await api(client, 'POST', '/appointments', {})).status, 422);
  const longReason = await book(client, free, 'x'.repeat(301));
  assert.strictEqual(longReason.status, 422);
  assert.match(longReason.json.error.fields.reason, /300 caractères/);
  assert.strictEqual(await Appointment.countDocuments(), 0);

  assert.strictEqual((await book(client, free)).status, 201);
  const clash = await makeSlot(await makeDoctor('Zola', cardio), 60); // same time, another doctor
  const overlap = await book(client, clash);
  assert.strictEqual(overlap.status, 409);
  assert.match(overlap.json.error.fields.slot, /déjà un rendez-vous à cette heure/);
});

test('eight patients booking one slot through the API: exactly one 201, the rest 409', async () => {
  const doctor = await makeDoctor('Abel', cardio);
  const slot = await makeSlot(doctor, 48);
  const people = await Promise.all(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'].map(apiPatient));
  const results = await Promise.all(people.map(({ client }) => book(client, slot)));
  const statuses = results.map((r) => r.status).sort();
  assert.deepStrictEqual(statuses, [201, 409, 409, 409, 409, 409, 409, 409]);
  const state = await consistency();
  assert.deepStrictEqual(state.bookedSlots, state.confirmedSlots);
  assert.strictEqual(await Appointment.countDocuments({ status: 'confirmed' }), 1);
});

test('each role lists its own appointments, split into upcoming and history', async () => {
  const { doctor, s1, jean, appointment } = await setup();
  const marie = await apiPatient('Marie');
  const other = await makeDoctor('Zola', cardio);
  await book(marie.client, await makeSlot(other, 72));
  const old = await makeSlot(doctor, -5, 30, 'booked');
  const patient = await Patient.findOne({ user: (await User.findOne({ email: 'jean@exemple.test' })).id });
  await Appointment.create({ slot: old.id, doctor: doctor.id, patient: patient.id, start: old.start, end: old.end });
  await api(jean.client, 'POST', `/appointments/${appointment.id}/cancel`);
  await book(jean.client, s1);

  const mine = await api(jean.client, 'GET', '/appointments');
  assert.strictEqual(mine.json.timezone, 'Africa/Bujumbura');
  assert.strictEqual(mine.json.upcoming.length, 1);
  assert.strictEqual(mine.json.history.length, 2); // the past one and the cancelled one
  assert.ok(mine.json.history.some((a) => a.status === 'cancelled' && a.cancelledBy === 'patient'));
  assert.ok(mine.json.upcoming.concat(mine.json.history).every((a) => a.patient.fullName === 'Pat Jean'));

  const abel = await apiStaff('abel');
  const doctorView = await api(abel, 'GET', '/appointments');
  assert.ok(doctorView.json.upcoming.concat(doctorView.json.history).every((a) => a.doctor.id === String(doctor.id)));
  const admin = await apiStaff('admin');
  const all = await api(admin, 'GET', '/appointments');
  assert.strictEqual(all.json.upcoming.length, 2);
});

test('reading one appointment: owner, their doctor and admins; everyone else gets 404', async () => {
  const { appointment, jean } = await setup();
  assert.strictEqual((await api(jean.client, 'GET', `/appointments/${appointment.id}`)).json.appointment.id, appointment.id);
  assert.strictEqual((await api(await apiStaff('abel'), 'GET', `/appointments/${appointment.id}`)).status, 200);
  assert.strictEqual((await api(await apiStaff('admin'), 'GET', `/appointments/${appointment.id}`)).status, 200);
  const marie = await apiPatient('Marie');
  assert.strictEqual((await api(marie.client, 'GET', `/appointments/${appointment.id}`)).status, 404);
  await makeDoctor('Zola', cardio);
  assert.strictEqual((await api(await apiStaff('zola'), 'GET', `/appointments/${appointment.id}`)).status, 404);
  for (const id of [SOME_ID, 'bad']) assert.strictEqual((await api(jean.client, 'GET', `/appointments/${id}`)).status, 404);
});

test('modifying: move to another slot of the same doctor, or only change the reason', async () => {
  const { s1, s2, jean, appointment } = await setup();
  const moved = await api(jean.client, 'PUT', `/appointments/${appointment.id}`, { slot: String(s2.id), reason: 'Nouveau motif' });
  assert.strictEqual(moved.status, 200);
  assert.strictEqual(moved.json.appointment.start, s2.start.toISOString());
  assert.strictEqual(moved.json.appointment.reason, 'Nouveau motif');
  assert.strictEqual((await Slot.findById(s1.id)).status, 'free');
  assert.strictEqual((await Slot.findById(s2.id)).status, 'booked');

  const reasonOnly = await api(jean.client, 'PUT', `/appointments/${appointment.id}`, { reason: 'Autre' });
  assert.strictEqual(reasonOnly.json.appointment.reason, 'Autre');
  assert.strictEqual(reasonOnly.json.appointment.start, s2.start.toISOString());
  const slotOnly = await api(jean.client, 'PUT', `/appointments/${appointment.id}`, { slot: String(s1.id) });
  assert.strictEqual(slotOnly.json.appointment.reason, 'Autre'); // omitted reason is kept
  assert.strictEqual(slotOnly.json.appointment.start, s1.start.toISOString());
  const state = await consistency();
  assert.deepStrictEqual(state.bookedSlots, state.confirmedSlots);
});

test('modification refusals: taken slot, other doctor, bad input, staff, other patients', async () => {
  const { s2, jean, appointment } = await setup();
  const marie = await apiPatient('Marie');
  await book(marie.client, s2);
  const taken = await api(jean.client, 'PUT', `/appointments/${appointment.id}`, { slot: String(s2.id) });
  assert.strictEqual(taken.status, 409);
  assert.ok(taken.json.error.fields.slot);

  const foreign = await makeSlot(await makeDoctor('Zola', cardio), 70);
  assert.strictEqual((await api(jean.client, 'PUT', `/appointments/${appointment.id}`, { slot: String(foreign.id) })).status, 422);
  assert.strictEqual((await api(jean.client, 'PUT', `/appointments/${appointment.id}`, { slot: 'bad' })).status, 422);
  assert.strictEqual((await api(jean.client, 'PUT', `/appointments/${appointment.id}`, { reason: 'x'.repeat(301) })).status, 422);
  assert.strictEqual((await api(await apiStaff('abel'), 'PUT', `/appointments/${appointment.id}`, {})).status, 403);
  assert.strictEqual((await api(marie.client, 'PUT', `/appointments/${appointment.id}`, {})).status, 404);
  assert.strictEqual((await api(jean.client, 'PUT', `/appointments/${SOME_ID}`, {})).status, 404);
  assert.strictEqual(String((await Appointment.findById(appointment.id)).start.getTime()), String((await Slot.findOne({ _id: (await Appointment.findById(appointment.id)).slot })).start.getTime()));
});

test('an admin can modify any appointment', async () => {
  const { s2, appointment } = await setup();
  const res = await api(await apiStaff('admin'), 'PUT', `/appointments/${appointment.id}`, { slot: String(s2.id) });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.appointment.start, s2.start.toISOString());
});

test('cancelling: owner, doctor and admin; twice or after the date is a 409; strangers get 404', async () => {
  const { s1, jean, appointment } = await setup();
  const done = await api(jean.client, 'POST', `/appointments/${appointment.id}/cancel`);
  assert.strictEqual(done.status, 200);
  assert.strictEqual(done.json.appointment.status, 'cancelled');
  assert.strictEqual(done.json.appointment.cancelledBy, 'patient');
  assert.ok(done.json.appointment.cancelledAt);
  assert.strictEqual((await Slot.findById(s1.id)).status, 'free');
  assert.strictEqual((await api(jean.client, 'POST', `/appointments/${appointment.id}/cancel`)).status, 409);
  assert.strictEqual((await api(jean.client, 'PUT', `/appointments/${appointment.id}`, {})).status, 409); // cancelled: not modifiable

  const again = (await book(jean.client, s1)).json.appointment;
  const byDoctor = await api(await apiStaff('abel'), 'POST', `/appointments/${again.id}/cancel`);
  assert.strictEqual(byDoctor.json.appointment.cancelledBy, 'doctor');
  const third = (await book(jean.client, s1)).json.appointment;
  const marie = await apiPatient('Marie');
  assert.strictEqual((await api(marie.client, 'POST', `/appointments/${third.id}/cancel`)).status, 404);
  const byAdmin = await api(await apiStaff('admin'), 'POST', `/appointments/${third.id}/cancel`);
  assert.strictEqual(byAdmin.json.appointment.cancelledBy, 'admin');
  for (const id of [SOME_ID, 'bad']) assert.strictEqual((await api(jean.client, 'POST', `/appointments/${id}/cancel`)).status, 404);
});

test('moving and cancelling at the same instant keeps slots consistent', async () => {
  for (let i = 0; i < 5; i += 1) {
    await db.clear();
    cardio = await Specialty.create({ name: 'Cardiologie' });
    const { jean, s2, appointment } = await setup();
    await Promise.all([
      api(jean.client, 'PUT', `/appointments/${appointment.id}`, { slot: String(s2.id) }),
      api(jean.client, 'POST', `/appointments/${appointment.id}/cancel`),
    ]);
    const state = await consistency();
    assert.deepStrictEqual(state.bookedSlots, state.confirmedSlots, `iteration ${i}`);
    assert.strictEqual(state.timesMatch, true, `iteration ${i}`);
    closeAll();
  }
});

test('the daily agenda for doctors and admins, with validation', async () => {
  const doctor = await makeDoctor('Abel', cardio);
  const other = await makeDoctor('Zola', cardio);
  const jean = await apiPatient('Jean');
  const day = addDays(today(), 6);
  const at = async (d, date, time) => {
    const start = zonedToUtc(date, time);
    const slot = await Slot.create({ doctor: d.id, start, end: new Date(start.getTime() + 1800000), status: 'booked' });
    return Appointment.create({ slot: slot.id, doctor: d.id, patient: jean.patient.id, start, end: slot.end, reason: 'Contrôle' });
  };
  await at(doctor, day, '14:00');
  await at(doctor, day, '09:00');
  await at(other, day, '10:00');
  await at(doctor, addDays(day, 1), '09:00');

  const abel = await apiStaff('abel');
  const mine = await api(abel, 'GET', `/appointments/day?date=${day}`);
  assert.strictEqual(mine.status, 200);
  assert.strictEqual(mine.json.date, day);
  assert.deepStrictEqual(mine.json.appointments.map((a) => a.start.slice(11, 16)), ['07:00', '12:00']); // 09:00 and 14:00 at UTC+2
  const all = await api(await apiStaff('admin'), 'GET', `/appointments/day?date=${day}`);
  assert.strictEqual(all.json.appointments.length, 3);

  assert.strictEqual((await api(abel, 'GET', '/appointments/day')).json.date, today());
  for (const bad of ['2027-02-31', 'demain', '2027-13-01']) {
    const res = await api(abel, 'GET', `/appointments/day?date=${bad}`);
    assert.strictEqual(res.status, 422, bad);
    assert.ok(res.json.error.fields.date);
  }
  assert.strictEqual((await api(abel, 'GET', '/appointments/day?date=a&date=b')).status, 422);
});
