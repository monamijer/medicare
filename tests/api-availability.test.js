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
const { addDays, today } = require('../src/utils/time');
const { createUser } = require('./helpers/fixtures');
const { api, apiLogin } = require('./helpers/api');
const clinicHelpers = require('./helpers/clinic');

const { newClient, closeAll, makeDoctor, makePatient } = clinicHelpers(app);
let cardio;
const DAY = addDays(today(), 4);

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

async function doctorWithClient(name) {
  const doctor = await makeDoctor(name, cardio);
  const client = newClient();
  await apiLogin(client, `${name.toLowerCase()}@clinique.test`);
  return { doctor, client };
}
async function adminClient() {
  await createUser('admin');
  const client = newClient();
  await apiLogin(client, 'admin@clinique.test');
  return client;
}
const range = (over = {}) => ({ date: DAY, from: '09:00', to: '11:00', duration: 30, ...over });

test('doctors and admins only: patients get 403, anonymous users 401', async () => {
  await makePatient('Jean');
  const patient = newClient();
  await apiLogin(patient, 'jean@exemple.test');
  for (const [method, path] of [['GET', '/availability'], ['POST', '/availability'], ['GET', '/availability/64b7f0c2a1b2c3d4e5f60718'], ['PUT', '/availability/64b7f0c2a1b2c3d4e5f60718'], ['DELETE', '/availability/64b7f0c2a1b2c3d4e5f60718']]) {
    assert.strictEqual((await api(patient, method, path, ['POST', 'PUT'].includes(method) ? range() : undefined)).status, 403, `${method} ${path}`);
    assert.strictEqual((await api(newClient(), method, path, ['POST', 'PUT'].includes(method) ? range() : undefined)).status, 401, `${method} ${path}`);
  }
});

test('a doctor adds slots (UTC times from clinic time) and lists them with their status', async () => {
  const { doctor, client } = await doctorWithClient('Abel');
  const created = await api(client, 'POST', '/availability', range());
  assert.strictEqual(created.status, 201);
  assert.deepStrictEqual(created.json, { created: 4 });

  const list = await api(client, 'GET', '/availability');
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.json.timezone, 'Africa/Bujumbura');
  assert.strictEqual(list.json.doctor.id, String(doctor.id));
  assert.strictEqual(list.json.slots.length, 4);
  assert.deepStrictEqual(Object.keys(list.json.slots[0]).sort(), ['end', 'id', 'start', 'status']);
  assert.strictEqual(list.json.slots[0].start, `${DAY}T07:00:00.000Z`); // 09:00 at UTC+2
  assert.strictEqual(list.json.slots[0].status, 'free');
});

test('duration is optional (30 minutes), may be a string, and 0 makes one single slot', async () => {
  const { doctor, client } = await doctorWithClient('Abel');
  assert.strictEqual((await api(client, 'POST', '/availability', { date: DAY, from: '09:00', to: '10:00' })).json.created, 2);
  assert.strictEqual((await api(client, 'POST', '/availability', range({ from: '10:00', to: '11:00', duration: '20' }))).json.created, 3);
  assert.strictEqual((await api(client, 'POST', '/availability', range({ from: '14:00', to: '14:45', duration: 0 }))).json.created, 1);
  const single = await Slot.findOne({ doctor: doctor.id, end: { $gt: new Date(`${DAY}T11:30:00Z`) } });
  assert.strictEqual(single.end - single.start, 45 * 60000);
});

test('overlaps are refused (adjacent is fine); invalid input gives per-field errors', async () => {
  const { doctor, client } = await doctorWithClient('Abel');
  await api(client, 'POST', '/availability', range({ from: '09:00', to: '10:00' }));
  const clash = await api(client, 'POST', '/availability', range({ from: '09:30', to: '10:30' }));
  assert.strictEqual(clash.status, 409);
  assert.match(clash.json.error.fields.date, /Conflit avec un créneau existant/);
  assert.strictEqual((await api(client, 'POST', '/availability', range({ from: '10:00', to: '11:00' }))).status, 201);
  assert.strictEqual(await Slot.countDocuments({ doctor: doctor.id }), 4);

  const cases = [
    [{ date: addDays(today(), -1) }, 'date'],
    [{ from: '11:00', to: '09:00' }, 'to'],
    [{ duration: 7 }, 'duration'],
    [{ from: '09:00', to: '09:20', duration: 30 }, 'duration'],
    [{ date: 'demain' }, 'date'],
    [{ from: '9h' }, 'from'],
  ];
  for (const [over, field] of cases) {
    const res = await api(client, 'POST', '/availability', range(over));
    assert.strictEqual(res.status, 422, JSON.stringify(over));
    assert.ok(res.json.error.fields[field], `${field} for ${JSON.stringify(over)}`);
  }
  assert.strictEqual(await Slot.countDocuments({ doctor: doctor.id }), 4);
});

test('an admin must name the doctor; a doctor always works on their own slots', async () => {
  const a = await doctorWithClient('Abel');
  const b = await doctorWithClient('Zola');
  const admin = await adminClient();

  const missing = await api(admin, 'POST', '/availability', range());
  assert.strictEqual(missing.status, 422);
  assert.ok(missing.json.error.fields.doctor);
  assert.strictEqual((await api(admin, 'GET', '/availability')).status, 422);
  assert.strictEqual((await api(admin, 'GET', '/availability?doctor=bad')).status, 404);

  assert.strictEqual((await api(admin, 'POST', `/availability?doctor=${a.doctor.id}`, range())).status, 201);
  assert.strictEqual((await api(admin, 'POST', '/availability', range({ date: addDays(DAY, 1), doctor: String(a.doctor.id) }))).status, 201);
  const seen = await api(admin, 'GET', `/availability?doctor=${a.doctor.id}`);
  assert.strictEqual(seen.json.slots.length, 8);

  // Zola tries to act for Abel: the doctor parameter is ignored, the slots land on Zola.
  await api(b.client, 'POST', `/availability?doctor=${a.doctor.id}`, range({ date: addDays(DAY, 2) }));
  assert.strictEqual(await Slot.countDocuments({ doctor: a.doctor.id }), 8);
  assert.strictEqual(await Slot.countDocuments({ doctor: b.doctor.id }), 4);
  assert.strictEqual((await api(b.client, 'GET', `/availability?doctor=${a.doctor.id}`)).json.doctor.id, String(b.doctor.id));
});

test('reading, moving and deleting one slot', async () => {
  const { client } = await doctorWithClient('Abel');
  await api(client, 'POST', '/availability', range({ from: '09:00', to: '10:00' }));
  const [first, second] = (await api(client, 'GET', '/availability')).json.slots;

  assert.deepStrictEqual((await api(client, 'GET', `/availability/${first.id}`)).json.slot, first);
  const moved = await api(client, 'PUT', `/availability/${first.id}`, { date: DAY, from: '08:00', to: '08:30' });
  assert.strictEqual(moved.status, 200);
  assert.strictEqual(moved.json.slot.start, `${DAY}T06:00:00.000Z`);
  assert.strictEqual((await api(client, 'PUT', `/availability/${first.id}`, { date: DAY, from: '09:15', to: '09:45' })).status, 409); // overlaps the second
  assert.strictEqual((await api(client, 'PUT', `/availability/${second.id}`, { date: DAY, from: '25:00', to: '09:45' })).status, 422);

  assert.strictEqual((await api(client, 'DELETE', `/availability/${first.id}`)).status, 204);
  assert.strictEqual((await api(client, 'GET', `/availability/${first.id}`)).status, 404);
  for (const id of ['64b7f0c2a1b2c3d4e5f60718', 'bad']) {
    assert.strictEqual((await api(client, 'GET', `/availability/${id}`)).status, 404);
    assert.strictEqual((await api(client, 'PUT', `/availability/${id}`, { date: DAY, from: '09:00', to: '10:00' })).status, 404);
    assert.strictEqual((await api(client, 'DELETE', `/availability/${id}`)).status, 404);
  }
});

test('booked slots cannot be moved or deleted', async () => {
  const { client } = await doctorWithClient('Abel');
  await api(client, 'POST', '/availability', range({ from: '09:00', to: '09:30' }));
  const slot = (await api(client, 'GET', '/availability')).json.slots[0];
  await Slot.updateOne({ _id: slot.id }, { status: 'booked' });
  assert.strictEqual((await api(client, 'GET', `/availability/${slot.id}`)).json.slot.status, 'booked');
  const move = await api(client, 'PUT', `/availability/${slot.id}`, { date: DAY, from: '12:00', to: '12:30' });
  assert.strictEqual(move.status, 409);
  assert.match(move.json.error.message, /réservé/);
  assert.strictEqual((await api(client, 'DELETE', `/availability/${slot.id}`)).status, 409);
  assert.strictEqual(await Slot.countDocuments({ _id: slot.id }), 1);
});

test('a doctor cannot see or change another doctor\'s slots; an admin can', async () => {
  const a = await doctorWithClient('Abel');
  const b = await doctorWithClient('Zola');
  await api(a.client, 'POST', '/availability', range({ from: '09:00', to: '09:30' }));
  const slot = (await api(a.client, 'GET', '/availability')).json.slots[0];
  assert.strictEqual((await api(b.client, 'GET', `/availability/${slot.id}`)).status, 404);
  assert.strictEqual((await api(b.client, 'PUT', `/availability/${slot.id}`, { date: DAY, from: '10:00', to: '10:30' })).status, 404);
  assert.strictEqual((await api(b.client, 'DELETE', `/availability/${slot.id}`)).status, 404);
  assert.strictEqual((await api(await adminClient(), 'DELETE', `/availability/${slot.id}`)).status, 204);
});

test('slots cannot be added for a deactivated doctor', async () => {
  const { doctor } = await doctorWithClient('Abel');
  const admin = await adminClient();
  await User.updateOne({ email: 'abel@clinique.test' }, { active: false });
  const res = await api(admin, 'POST', `/availability?doctor=${doctor.id}`, range());
  assert.strictEqual(res.status, 409);
  assert.match(res.json.error.message, /désactivé/);
});
