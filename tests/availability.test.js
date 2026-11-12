const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const Doctor = require('../src/models/Doctor');
const Specialty = require('../src/models/Specialty');
const Slot = require('../src/models/AvailabilitySlot');
const User = require('../src/models/User');
const doctorService = require('../src/services/doctorService');
const { createClient } = require('./helpers/http');
const { createUser, loginAs } = require('./helpers/fixtures');

const clients = [];
const newClient = () => { const c = createClient(app); clients.push(c); return c; };
let spec;

test.before(async () => {
  await db.connect();
  await Promise.all([User.init(), Doctor.init(), Slot.init()]);
});
test.beforeEach(async () => {
  await db.clear();
  spec = await Specialty.create({ name: 'Cardiologie' });
});
test.afterEach(() => { while (clients.length) clients.pop().close(); });
test.after(db.close);

const dayFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function makeDoctor(email, license) {
  const doctor = await doctorService.create({
    firstName: 'Awa', lastName: email.split('@')[0], email, password: 'motdepasse1',
    specialty: spec.id, licenseNumber: license, phone: '',
  });
  const client = newClient();
  await loginAs(client, email);
  return { doctor, client };
}

const batch = (client, over = {}, query = '') => client.request(`/availability${query}`, {
  method: 'POST', form: { date: dayFromNow(3), from: '09:00', to: '11:00', duration: '30', ...over },
});

test('doctors and admins only; patients get 403, anonymous users are redirected', async () => {
  await createUser('patient');
  const patient = newClient();
  await loginAs(patient, 'patient@clinique.test');
  assert.strictEqual((await patient.request('/availability')).status, 403);
  assert.strictEqual((await batch(patient)).status, 403);
  const res = await newClient().request('/availability');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/login');
});

test('a doctor adds a morning of 30-minute slots, stored in UTC from clinic time', async () => {
  const { doctor, client } = await makeDoctor('dr1@clinique.test', 'L1');
  assert.match((await client.request('/availability')).html, /Aucune disponibilité à venir/);

  const res = await batch(client);
  assert.strictEqual(res.status, 302);
  const slots = await Slot.find({ doctor: doctor.id }).sort({ start: 1 });
  assert.strictEqual(slots.length, 4);
  assert.strictEqual(slots[0].start.toISOString(), `${dayFromNow(3)}T07:00:00.000Z`); // 09:00 at UTC+2
  assert.strictEqual(slots[3].end.toISOString(), `${dayFromNow(3)}T09:00:00.000Z`);
  assert.ok(slots.every((s) => s.status === 'free'));

  const page = await client.request('/availability');
  assert.match(page.html, /4 créneaux ajoutés/);
  assert.match(page.html, /09:00 – 09:30/);
  assert.match(page.html, /10:30 – 11:00/);
  assert.match(page.html, /Libre/);
});

test('a single slot can cover the whole range', async () => {
  const { doctor, client } = await makeDoctor('dr1@clinique.test', 'L1');
  await batch(client, { from: '14:00', to: '14:45', duration: '0' });
  const slots = await Slot.find({ doctor: doctor.id });
  assert.strictEqual(slots.length, 1);
  assert.strictEqual(slots[0].end - slots[0].start, 45 * 60000);
});

test('overlapping slots are refused, adjacent ones are accepted', async () => {
  const { doctor, client } = await makeDoctor('dr1@clinique.test', 'L1');
  await batch(client, { from: '09:00', to: '10:00' });
  for (const over of [{ from: '09:30', to: '10:30' }, { from: '08:30', to: '09:30' }, { from: '08:00', to: '09:15', duration: '0' }, { from: '09:00', to: '10:00' }, { from: '08:00', to: '12:00' }]) {
    const res = await batch(client, over);
    assert.strictEqual(res.status, 409, JSON.stringify(over));
    assert.match(res.html, /Conflit avec un créneau existant/);
  }
  assert.strictEqual(await Slot.countDocuments({ doctor: doctor.id }), 2);
  assert.strictEqual((await batch(client, { from: '10:00', to: '11:00' })).status, 302);
  assert.strictEqual(await Slot.countDocuments({ doctor: doctor.id }), 4);
});

test('another doctor may have slots at the same time', async () => {
  const a = await makeDoctor('dr1@clinique.test', 'L1');
  const b = await makeDoctor('dr2@clinique.test', 'L2');
  assert.strictEqual((await batch(a.client)).status, 302);
  assert.strictEqual((await batch(b.client)).status, 302);
  assert.strictEqual(await Slot.countDocuments(), 8);
});

test('simultaneous identical requests never create duplicates', async () => {
  const { doctor, client } = await makeDoctor('dr1@clinique.test', 'L1');
  const second = newClient();
  await loginAs(second, 'dr1@clinique.test');
  const results = await Promise.all([batch(client), batch(second), batch(client), batch(second)]);
  assert.ok(results.some((r) => r.status === 302));
  const slots = await Slot.find({ doctor: doctor.id }).sort({ start: 1 });
  assert.strictEqual(slots.length, 4);
  for (let i = 1; i < slots.length; i += 1) assert.ok(slots[i].start >= slots[i - 1].end);
});

test('invalid input is refused: past date, end before start, bad duration, too short, too many', async () => {
  const { doctor, client } = await makeDoctor('dr1@clinique.test', 'L1');
  const cases = [
    [{ date: dayFromNow(-1) }, /futur/],
    [{ from: '11:00', to: '09:00' }, /après l'heure de début/],
    [{ from: '09:00', to: '09:00' }, /après l'heure de début/],
    [{ duration: '7' }, /Choisissez une durée/],
    [{ from: '09:00', to: '09:20', duration: '30' }, /plus courte/],
    [{ from: '00:00', to: '23:45', duration: '15' }, /48 créneaux/],
    [{ date: '2027-02-31' }, /date et une heure/],
    [{ date: '' }, /date valide/],
  ];
  for (const [over, message] of cases) {
    const res = await batch(client, over);
    assert.strictEqual(res.status, 422, JSON.stringify(over));
    assert.match(res.html, message);
  }
  assert.strictEqual(await Slot.countDocuments({ doctor: doctor.id }), 0);
});

test('a doctor edits a free slot; conflicts and booked slots are refused', async () => {
  const { doctor, client } = await makeDoctor('dr1@clinique.test', 'L1');
  await batch(client, { from: '09:00', to: '10:00' });
  const [first, second] = await Slot.find({ doctor: doctor.id }).sort({ start: 1 });

  const form = await client.request(`/availability/${first.id}/edit`);
  assert.match(form.html, /value="09:00"/);
  assert.match(form.html, /value="09:30"/);

  const move = (slot, from, to) => client.request(`/availability/${slot.id}`, { method: 'POST', form: { date: dayFromNow(3), from, to } });
  assert.strictEqual((await move(first, '09:15', '09:45')).status, 409); // overlaps the second slot
  assert.strictEqual((await move(first, '08:00', '08:30')).status, 302);
  assert.strictEqual(formatUtc((await Slot.findById(first.id)).start), `${dayFromNow(3)}T06:00`);
  assert.strictEqual((await move(second, '09:30', '09:50')).status, 302); // keeping its own place is fine

  await Slot.updateOne({ _id: second.id }, { status: 'booked' });
  const booked = await move(second, '12:00', '12:30');
  assert.strictEqual(booked.status, 409);
  assert.match(booked.html, /réservé/);
});

function formatUtc(date) { return date.toISOString().slice(0, 16); }

test('free slots can be deleted, booked slots cannot', async () => {
  const { doctor, client } = await makeDoctor('dr1@clinique.test', 'L1');
  await batch(client, { from: '09:00', to: '10:00' });
  const [free, booked] = await Slot.find({ doctor: doctor.id }).sort({ start: 1 });
  await Slot.updateOne({ _id: booked.id }, { status: 'booked' });

  assert.strictEqual((await client.request(`/availability/${free.id}/delete`, { method: 'POST' })).status, 302);
  assert.strictEqual(await Slot.countDocuments({ _id: free.id }), 0);

  const refused = await client.request(`/availability/${booked.id}/delete`, { method: 'POST' });
  assert.strictEqual(refused.status, 302);
  assert.strictEqual(await Slot.countDocuments({ _id: booked.id }), 1);
  const page = await client.request('/availability');
  assert.match(page.html, /Ce créneau est réservé/);
  assert.match(page.html, /Réservé/);
});

test('a doctor cannot see or change another doctor\'s slots', async () => {
  const a = await makeDoctor('dr1@clinique.test', 'L1');
  const b = await makeDoctor('dr2@clinique.test', 'L2');
  await batch(a.client);
  const slot = await Slot.findOne({ doctor: a.doctor.id });
  assert.doesNotMatch((await b.client.request('/availability')).html, /09:00 – 09:30/);
  assert.strictEqual((await b.client.request(`/availability/${slot.id}/edit`)).status, 404);
  assert.strictEqual((await b.client.request(`/availability/${slot.id}`, { method: 'POST', form: { date: dayFromNow(4), from: '09:00', to: '09:30' } })).status, 404);
  assert.strictEqual((await b.client.request(`/availability/${slot.id}/delete`, { method: 'POST' })).status, 404);
  // a doctor cannot act for someone else by sending a doctor id
  await b.client.request('/availability?doctor=' + a.doctor.id, { method: 'POST', form: { date: dayFromNow(5), from: '09:00', to: '10:00', duration: '30', doctor: String(a.doctor.id) } });
  assert.strictEqual(await Slot.countDocuments({ doctor: a.doctor.id }), 4);
  assert.strictEqual(await Slot.countDocuments({ doctor: b.doctor.id }), 2);
});

test('an admin picks a doctor and manages that doctor\'s slots', async () => {
  const { doctor } = await makeDoctor('dr1@clinique.test', 'L1');
  await createUser('admin');
  const admin = newClient();
  await loginAs(admin, 'admin@clinique.test');

  const choose = await admin.request('/availability');
  assert.match(choose.html, /Choisissez un médecin/);
  assert.match(choose.html, new RegExp(`/availability\\?doctor=${doctor.id}`));

  const res = await batch(admin, { doctor: String(doctor.id) }, `?doctor=${doctor.id}`);
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, `/availability?doctor=${doctor.id}`);
  assert.strictEqual(await Slot.countDocuments({ doctor: doctor.id }), 4);

  const page = await admin.request(res.location);
  assert.match(page.html, /Médecin : Awa dr1/);
  const slot = await Slot.findOne({ doctor: doctor.id });
  assert.strictEqual((await admin.request(`/availability/${slot.id}/delete?doctor=${doctor.id}`, { method: 'POST' })).location, `/availability?doctor=${doctor.id}`);
  assert.strictEqual((await admin.request('/availability?doctor=bad')).status, 404);
  assert.strictEqual((await admin.request('/availability/new')).status, 302);
});

test('only upcoming slots are listed, grouped by day in French', async () => {
  const { doctor, client } = await makeDoctor('dr1@clinique.test', 'L1');
  await Slot.create({ doctor: doctor.id, start: new Date(Date.now() - 7200000), end: new Date(Date.now() - 3600000) });
  await batch(client, { date: dayFromNow(2), from: '09:00', to: '09:30', duration: '30' });
  await batch(client, { date: dayFromNow(3), from: '09:00', to: '09:30', duration: '30' });
  const { html } = await client.request('/availability');
  assert.strictEqual((html.match(/day-title/g) || []).length, 2);
  assert.strictEqual((html.match(/<tr><td>\d\d:\d\d – /g) || []).length, 2);
  assert.match(html, /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d{1,2} \S+ 20\d\d/);
});
