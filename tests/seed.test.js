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
const { seedDemoData } = require('../scripts/seed');
const { api } = require('./helpers/api');
const clinicHelpers = require('./helpers/clinic');

const { newClient, closeAll, consistency } = clinicHelpers(app);

test.before(db.connect);
test.beforeEach(async () => { await db.clear(); });
test.afterEach(closeAll);
test.after(db.close);

test('seeding an empty database creates a coherent demo clinic', async () => {
  const summary = await seedDemoData();
  assert.strictEqual(await User.countDocuments(), 1 + 6 + 8);
  assert.strictEqual(await Specialty.countDocuments(), 6);
  assert.strictEqual(await Doctor.countDocuments(), 6);
  assert.strictEqual(await Patient.countDocuments(), 8);
  assert.ok(summary.counts.slots > 400);
  assert.ok(summary.counts.upcomingAppointments >= 10);
  assert.strictEqual(summary.counts.pastAppointments, 4);
  assert.strictEqual(await Appointment.countDocuments({ status: 'cancelled' }), 1);

  const state = await consistency();
  assert.deepStrictEqual(state.bookedSlots, state.confirmedSlots); // every booked slot has exactly one appointment
  assert.strictEqual(state.timesMatch, true);
  assert.ok(await Slot.countDocuments({ status: 'free', start: { $gt: new Date() } }) > 300);
});

test('the demo accounts can sign in with the announced password, with the right roles', async () => {
  const summary = await seedDemoData();
  const expected = [[summary.admin, 'admin'], [summary.doctors[1], 'doctor'], [summary.patients[2], 'patient']];
  for (const [email, role] of expected) {
    const res = await api(newClient(), 'POST', '/auth/login', { email, password: summary.password });
    assert.strictEqual(res.status, 200, email);
    assert.strictEqual(res.json.user.role, role);
  }
});

test('demo data is usable: patients see doctors and free slots, doctors have appointments', async () => {
  const summary = await seedDemoData();
  const patient = newClient();
  await api(patient, 'POST', '/auth/login', { email: summary.patients[0], password: summary.password });
  const { doctors } = (await api(patient, 'GET', '/doctors')).json;
  assert.strictEqual(doctors.length, 6);
  const slots = await api(patient, 'GET', `/doctors/${doctors[0].id}/slots`);
  assert.ok(slots.json.slots.length > 40);

  const mine = (await api(patient, 'GET', '/appointments')).json;
  assert.ok(mine.upcoming.length + mine.history.length >= 1);
  const admin = newClient();
  await api(admin, 'POST', '/auth/login', { email: summary.admin, password: summary.password });
  const all = (await api(admin, 'GET', '/appointments')).json;
  assert.ok(all.upcoming.length >= 10);
  assert.strictEqual(all.history.length, 4);
});

test('slots only fall on working days, in the future, inside clinic hours', async () => {
  await seedDemoData();
  const { toLocalParts } = require('../src/utils/time');
  const future = await Slot.find({ status: { $in: ['free', 'booked'] }, start: { $gt: new Date() } }).lean();
  assert.ok(future.length > 0);
  for (const slot of future) {
    const { date, time } = toLocalParts(slot.start);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    assert.ok(weekday >= 1 && weekday <= 5, `${date} is a weekend`);
    assert.ok((time >= '09:00' && time < '12:00') || (time >= '14:00' && time < '17:00'), `${time} outside hours`);
  }
});

test('seeding refuses a database that already has data; --reset rebuilds it', async () => {
  await seedDemoData();
  await assert.rejects(seedDemoData(), /contient déjà des données/);
  assert.strictEqual(await User.countDocuments(), 15);

  await User.create({ email: 'extra@medicare.test', passwordHash: 'x', role: 'admin', firstName: 'E', lastName: 'X' });
  await seedDemoData({ reset: true });
  assert.strictEqual(await User.countDocuments(), 15); // the extra user is gone
  assert.strictEqual(await User.countDocuments({ email: 'extra@medicare.test' }), 0);
  assert.strictEqual(await Doctor.countDocuments(), 6);
  await assert.rejects(User.create({ email: 'ADMIN@medicare.test', passwordHash: 'x', role: 'admin', firstName: 'D', lastName: 'Up' }), /duplicate|E11000/); // unique index rebuilt
});
