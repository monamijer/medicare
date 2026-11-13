const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const Appointment = require('../src/models/Appointment');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const Specialty = require('../src/models/Specialty');
const Slot = require('../src/models/AvailabilitySlot');
const User = require('../src/models/User');
const doctorService = require('../src/services/doctorService');
const patientService = require('../src/services/patientService');
const appointmentService = require('../src/services/appointmentService');
const { createClient } = require('./helpers/http');
const { createUser, loginAs } = require('./helpers/fixtures');

const clients = [];
const newClient = () => { const c = createClient(app); clients.push(c); return c; };
let cardio;
let derm;

test.before(async () => {
  await db.connect();
  await Promise.all([User.init(), Doctor.init(), Patient.init(), Slot.init(), Appointment.init()]);
});
test.beforeEach(async () => {
  await db.clear();
  [cardio, derm] = await Promise.all([Specialty.create({ name: 'Cardiologie' }), Specialty.create({ name: 'Dermatologie' })]);
});
test.afterEach(() => { while (clients.length) clients.pop().close(); });
test.after(db.close);


async function makeDoctor(name, specialty = cardio) {
  return doctorService.create({
    firstName: 'Dr', lastName: name, email: `${name.toLowerCase()}@clinique.test`, password: 'motdepasse1',
    specialty: specialty.id, licenseNumber: `L-${name}`, phone: '',
  });
}

async function makePatient(name) {
  const patient = await patientService.create({
    firstName: 'Pat', lastName: name, email: `${name.toLowerCase()}@exemple.test`, password: 'motdepasse1', birthDate: '1990-01-01', phone: '',
  });
  const client = newClient();
  await loginAs(client, `${name.toLowerCase()}@exemple.test`);
  return { patient, client };
}

const makeSlot = (doctor, startOffsetHours = 48, lengthMin = 30, status = 'free') => {
  const start = new Date(Date.now() + startOffsetHours * 3600000);
  return Slot.create({ doctor: doctor.id, start, end: new Date(start.getTime() + lengthMin * 60000), status });
};

const book = (client, slot, reason = '') => client.request('/appointments', { method: 'POST', form: { slot: String(slot.id || slot._id), reason } });

test('only patients can search and book; staff get 403, anonymous users are redirected', async () => {
  await createUser('admin');
  await createUser('doctor');
  for (const role of ['admin', 'doctor']) {
    const c = newClient();
    await loginAs(c, `${role}@clinique.test`);
    assert.strictEqual((await c.request('/appointments/new')).status, 403);
    assert.strictEqual((await c.request('/appointments', { method: 'POST', form: { slot: '64b7f0c2a1b2c3d4e5f60718' } })).status, 403);
  }
  const res = await newClient().request('/appointments/new');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/login');
});

test('search lists doctors of the chosen specialty with their free slot counts', async () => {
  const dr1 = await makeDoctor('Abel');
  const dr2 = await makeDoctor('Zola');
  const dr3 = await makeDoctor('Peau', derm);
  await makeSlot(dr1, 48); await makeSlot(dr1, 50); await makeSlot(dr1, 52, 30, 'booked');
  await makeSlot(dr1, -5); // past
  await makeSlot(dr3, 48);
  const { client } = await makePatient('Jean');

  const start = await client.request('/appointments/new');
  assert.match(start.html, /Choisir une spécialité/);
  assert.doesNotMatch(start.html, /Dr Abel/);

  const { html } = await client.request(`/appointments/new?specialty=${cardio.id}`);
  assert.match(html, /Dr Abel/);
  assert.match(html, /2 créneaux disponibles/);
  assert.match(html, /Dr Zola/);
  assert.match(html, /Aucune disponibilité/);
  assert.ok(html.indexOf('Dr Abel') < html.indexOf('Dr Zola'));
  assert.doesNotMatch(html, /Dr Peau/);
  assert.strictEqual((await client.request('/appointments/new?specialty=nimporte')).status, 200);
});

test('the slot page shows only free upcoming slots, grouped by day', async () => {
  const dr = await makeDoctor('Abel');
  const free = await makeSlot(dr, 48);
  const booked = await makeSlot(dr, 50, 30, 'booked');
  const past = await makeSlot(dr, -5);
  const { client } = await makePatient('Jean');
  const { html } = await client.request(`/appointments/new/${dr.id}`);
  assert.match(html, new RegExp(`/appointments/book/${free.id}`));
  assert.doesNotMatch(html, new RegExp(`/appointments/book/${booked.id}`));
  assert.doesNotMatch(html, new RegExp(`/appointments/book/${past.id}`));
  assert.strictEqual((await client.request('/appointments/new/bad')).status, 404);
});

test('booking creates an appointment, books the slot and shows it in the list', async () => {
  const dr = await makeDoctor('Abel');
  const slot = await makeSlot(dr, 48);
  const { client, patient } = await makePatient('Jean');

  const form = await client.request(`/appointments/book/${slot.id}`);
  assert.strictEqual(form.status, 200);
  assert.match(form.html, /Confirmer le rendez-vous/);
  assert.match(form.html, /Dr Abel/);

  const res = await book(client, slot, 'Douleurs thoraciques');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/appointments');

  const appointment = await Appointment.findOne();
  assert.strictEqual(String(appointment.patient), patient.id);
  assert.strictEqual(String(appointment.doctor), dr.id);
  assert.strictEqual(appointment.status, 'confirmed');
  assert.strictEqual(appointment.start.getTime(), slot.start.getTime());
  assert.strictEqual(appointment.reason, 'Douleurs thoraciques');
  assert.strictEqual((await Slot.findById(slot.id)).status, 'booked');

  const list = await client.request('/appointments');
  assert.match(list.html, /Rendez-vous confirmé/);
  assert.match(list.html, /Dr Abel/);
  assert.match(list.html, /Confirmé/);
  assert.doesNotMatch((await client.request(`/appointments/new/${dr.id}`)).html, new RegExp(`book/${slot.id}`));
});

test('a booked, past, unknown or malformed slot cannot be booked', async () => {
  const dr = await makeDoctor('Abel');
  const taken = await makeSlot(dr, 48, 30, 'booked');
  const past = await makeSlot(dr, -5);
  const { client } = await makePatient('Jean');

  for (const slot of [taken, past]) {
    const res = await book(client, slot);
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.location, '/appointments/new');
    assert.strictEqual((await client.request(`/appointments/book/${slot.id}`)).status, 302);
  }
  assert.match((await client.request('/appointments/new')).html, /plus disponible/);
  assert.strictEqual(await Appointment.countDocuments(), 0);
  assert.strictEqual((await client.request('/appointments/book/64b7f0c2a1b2c3d4e5f60718')).status, 404);
  assert.strictEqual((await client.request('/appointments/book/bad')).status, 404);
  const garbage = await client.request('/appointments', { method: 'POST', form: { slot: 'bad' } });
  assert.strictEqual(garbage.status, 302);
  assert.strictEqual(await Appointment.countDocuments(), 0);
});

test('simultaneous bookings of one slot create exactly one appointment', async () => {
  const dr = await makeDoctor('Abel');
  const slot = await makeSlot(dr, 48);
  const people = await Promise.all(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'].map(makePatient));
  const results = await Promise.all(people.map(({ client }) => book(client, slot)));

  const successes = results.filter((r) => r.location === '/appointments');
  assert.strictEqual(successes.length, 1);
  assert.strictEqual(await Appointment.countDocuments({ slot: slot.id, status: 'confirmed' }), 1);
  assert.strictEqual((await Slot.findById(slot.id)).status, 'booked');
});

test('the same patient double-clicking books once', async () => {
  const dr = await makeDoctor('Abel');
  const slot = await makeSlot(dr, 48);
  const { client } = await makePatient('Jean');
  await Promise.all([book(client, slot), book(client, slot), book(client, slot)]);
  assert.strictEqual(await Appointment.countDocuments(), 1);
});

test('a patient cannot hold two appointments at the same time', async () => {
  const dr1 = await makeDoctor('Abel');
  const dr2 = await makeDoctor('Zola', derm);
  const a = await makeSlot(dr1, 48, 30);
  const b = await makeSlot(dr2, 48, 30); // same time, other doctor
  const c = await makeSlot(dr2, 49, 30); // later
  const { client } = await makePatient('Jean');
  assert.strictEqual((await book(client, a)).location, '/appointments');
  const clash = await book(client, b);
  assert.strictEqual(clash.location, '/appointments/new');
  assert.match((await client.request('/appointments/new')).html, /déjà un rendez-vous à cette heure/);
  assert.strictEqual((await Slot.findById(b.id)).status, 'free');
  assert.strictEqual((await book(client, c)).location, '/appointments');
  assert.strictEqual(await Appointment.countDocuments(), 2);
});

test('the slot is given back if the appointment cannot be saved', async () => {
  const dr = await makeDoctor('Abel');
  const slot = await makeSlot(dr, 48);
  const { patient } = await makePatient('Jean');
  const original = Appointment.create;
  Appointment.create = async () => { throw new Error('disk full'); };
  try {
    await assert.rejects(appointmentService.book(String(patient.user), slot.id), /disk full/);
  } finally {
    Appointment.create = original;
  }
  assert.strictEqual((await Slot.findById(slot.id)).status, 'free');
  assert.strictEqual(await Appointment.countDocuments(), 0);
});

test('a too long reason is refused and keeps the form; reasons are escaped', async () => {
  const dr = await makeDoctor('Abel');
  const slot = await makeSlot(dr, 48);
  const { client } = await makePatient('Jean');
  const long = await book(client, slot, 'x'.repeat(301));
  assert.strictEqual(long.status, 422);
  assert.match(long.html, /300 caractères/);
  assert.strictEqual(await Appointment.countDocuments(), 0);
  assert.strictEqual((await Slot.findById(slot.id)).status, 'free');

  await book(client, slot, '<script>alert(1)</script>');
  const mine = await client.request('/appointments');
  assert.doesNotMatch(mine.html, /<script>alert/);
  const doctorClient = newClient();
  await loginAs(doctorClient, 'abel@clinique.test');
  const theirs = await doctorClient.request('/appointments');
  assert.match(theirs.html, /&lt;script&gt;alert\(1\)/);
});

test('each role sees the right appointments', async () => {
  const dr1 = await makeDoctor('Abel');
  const dr2 = await makeDoctor('Zola');
  const s1 = await makeSlot(dr1, 48);
  const s2 = await makeSlot(dr2, 72);
  const jean = await makePatient('Jean');
  const marie = await makePatient('Marie');
  await book(jean.client, s1);
  await book(marie.client, s2);

  const jeanPage = (await jean.client.request('/appointments')).html;
  assert.match(jeanPage, /Dr Abel/);
  assert.doesNotMatch(jeanPage, /Dr Zola/);
  assert.doesNotMatch(jeanPage, /Pat Marie/);

  const doctor = newClient();
  await loginAs(doctor, 'zola@clinique.test');
  const doctorPage = (await doctor.request('/appointments')).html;
  assert.match(doctorPage, /Pat Marie/);
  assert.doesNotMatch(doctorPage, /Pat Jean/);

  await createUser('admin');
  const admin = newClient();
  await loginAs(admin, 'admin@clinique.test');
  const adminPage = (await admin.request('/appointments')).html;
  for (const text of [/Dr Abel/, /Dr Zola/, /Pat Jean/, /Pat Marie/]) assert.match(adminPage, text);
});

test('empty states depend on the role', async () => {
  const { client } = await makePatient('Jean');
  const page = await client.request('/appointments');
  assert.match(page.html, /Aucun rendez-vous/);
  assert.match(page.html, /Prendre rendez-vous/);
});
