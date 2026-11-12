const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const Doctor = require('../src/models/Doctor');
const Specialty = require('../src/models/Specialty');
const User = require('../src/models/User');
const { createClient } = require('./helpers/http');
const { createUser, loginAs, PASSWORD } = require('./helpers/fixtures');

let admin;
let cardio;

test.before(async () => {
  await db.connect();
  await Promise.all([User.init(), Specialty.init(), Doctor.init()]);
});
test.beforeEach(async () => {
  await db.clear();
  await createUser('admin');
  cardio = await Specialty.create({ name: 'Cardiologie' });
  admin = createClient(app);
  await loginAs(admin, 'admin@clinique.test');
});
test.afterEach(() => admin.close());
test.after(db.close);

const valid = (over = {}) => ({
  firstName: 'Awa', lastName: 'Ndayi', email: 'awa.ndayi@clinique.test', password: 'motdepasse1',
  specialty: cardio.id, licenseNumber: 'BI-1001', phone: '+257 79 00 00 00', ...over,
});
const add = (over) => admin.request('/doctors', { method: 'POST', form: valid(over) });

test('only admins can manage doctors', async () => {
  await createUser('patient');
  const patient = createClient(app);
  await loginAs(patient, 'patient@clinique.test');
  assert.strictEqual((await patient.request('/doctors')).status, 403);
  assert.strictEqual((await patient.request('/doctors', { method: 'POST', form: valid() })).status, 403);
  patient.close();
  assert.strictEqual(await Doctor.countDocuments(), 0);
});

test('empty state, and a hint when no specialty exists yet', async () => {
  assert.match((await admin.request('/doctors')).html, /Aucun médecin/);
  await Specialty.deleteMany({});
  const form = await admin.request('/doctors/new');
  assert.match(form.html, /Créez d'abord une spécialité/);
  assert.doesNotMatch(form.html, /name="licenseNumber"/);
});

test('creating a doctor makes a doctor account that can log in', async () => {
  const res = await add();
  assert.strictEqual(res.status, 302);
  const doctor = await Doctor.findOne().populate('user');
  assert.strictEqual(res.location, `/doctors/${doctor.id}`);
  assert.strictEqual(doctor.user.role, 'doctor');
  assert.strictEqual(String(doctor.specialty), cardio.id);

  const page = await admin.request(res.location);
  assert.match(page.html, /Médecin créé\./);
  assert.match(page.html, /Awa Ndayi/);
  assert.match(page.html, /BI-1001/);

  const doctorClient = createClient(app);
  const login = await loginAs(doctorClient, 'awa.ndayi@clinique.test', PASSWORD);
  doctorClient.close();
  assert.strictEqual(login.status, 302);
});

test('the list shows doctors sorted by last name with their specialty', async () => {
  await add({ lastName: 'Zola', email: 'z@clinique.test', licenseNumber: 'BI-2' });
  await add({ lastName: 'Abel', email: 'a@clinique.test', licenseNumber: 'BI-3' });
  const { html } = await admin.request('/doctors');
  assert.ok(html.indexOf('Abel') > 0 && html.indexOf('Abel') < html.indexOf('Zola'));
  assert.match(html, /Cardiologie/);
});

test('validation errors keep the typed values and create nothing', async () => {
  const res = await add({ firstName: 'A', email: 'pas-un-email', specialty: 'x', licenseNumber: 'x', phone: 'abc', password: 'court' });
  assert.strictEqual(res.status, 422);
  for (const text of [/entre 2 et 60/, /adresse e-mail valide/, /Choisissez une spécialité/, /numéro de licence/, /téléphone valide/, /au moins 8/]) {
    assert.match(res.html, text);
  }
  assert.match(res.html, /value="pas-un-email"/);
  assert.strictEqual(await Doctor.countDocuments(), 0);
  assert.strictEqual(await User.countDocuments({ role: 'doctor' }), 0);
});

test('duplicate email or licence is refused and leaves no orphan account', async () => {
  await add();
  const sameEmail = await add({ licenseNumber: 'BI-9' });
  assert.strictEqual(sameEmail.status, 409);
  assert.match(sameEmail.html, /adresse e-mail est déjà utilisée/);
  const sameLicense = await add({ email: 'autre@clinique.test' });
  assert.strictEqual(sameLicense.status, 409);
  assert.match(sameLicense.html, /numéro de licence est déjà utilisé/);
  assert.strictEqual(await Doctor.countDocuments(), 1);
  assert.strictEqual(await User.countDocuments({ role: 'doctor' }), 1);
});

test('an unknown specialty is refused', async () => {
  const res = await add({ specialty: '64b7f0c2a1b2c3d4e5f60718' });
  assert.strictEqual(res.status, 422);
  assert.match(res.html, /spécialité valide/);
  assert.strictEqual(await User.countDocuments({ role: 'doctor' }), 0);
});

test('editing updates doctor and account; empty password keeps the old one', async () => {
  await add();
  const doctor = await Doctor.findOne();
  const derm = await Specialty.create({ name: 'Dermatologie' });

  const form = await admin.request(`/doctors/${doctor.id}/edit`);
  assert.match(form.html, /value="Awa"/);
  assert.match(form.html, /value="BI-1001"/);

  const res = await admin.request(`/doctors/${doctor.id}`, {
    method: 'POST',
    form: valid({ firstName: 'Awa-Marie', specialty: derm.id, password: '', phone: '' }),
  });
  assert.strictEqual(res.status, 302);
  const updated = await Doctor.findById(doctor.id).populate('user');
  assert.strictEqual(updated.user.firstName, 'Awa-Marie');
  assert.strictEqual(String(updated.specialty), derm.id);

  const c = createClient(app);
  assert.strictEqual((await loginAs(c, 'awa.ndayi@clinique.test', PASSWORD)).status, 302);
  c.close();
});

test('editing can change the password', async () => {
  await add();
  const doctor = await Doctor.findOne();
  await admin.request(`/doctors/${doctor.id}`, { method: 'POST', form: valid({ password: 'nouveaumotdepasse' }) });
  const c = createClient(app);
  assert.strictEqual((await loginAs(c, 'awa.ndayi@clinique.test', PASSWORD)).status, 401);
  assert.strictEqual((await loginAs(c, 'awa.ndayi@clinique.test', 'nouveaumotdepasse')).status, 302);
  c.close();
});

test('editing cannot take another doctor\'s email or licence, but may keep its own', async () => {
  await add();
  await add({ email: 'b@clinique.test', licenseNumber: 'BI-2002' });
  const second = await Doctor.findOne({ licenseNumber: 'BI-2002' });
  const post = (over) => admin.request(`/doctors/${second.id}`, { method: 'POST', form: valid({ email: 'b@clinique.test', licenseNumber: 'BI-2002', password: '', ...over }) });
  assert.strictEqual((await post({ email: 'awa.ndayi@clinique.test' })).status, 409);
  assert.strictEqual((await post({ licenseNumber: 'BI-1001' })).status, 409);
  assert.strictEqual((await post({})).status, 302);
});

test('deleting removes the doctor and the login account', async () => {
  await add();
  const doctor = await Doctor.findOne();
  const res = await admin.request(`/doctors/${doctor.id}/delete`, { method: 'POST' });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(await Doctor.countDocuments(), 0);
  assert.strictEqual(await User.countDocuments({ role: 'doctor' }), 0);
  assert.match((await admin.request('/doctors')).html, /supprimé/);
});

test('names are escaped and unknown ids give 404', async () => {
  await add({ firstName: '<b>Awa</b>' });
  assert.doesNotMatch((await admin.request('/doctors')).html, /<b>Awa<\/b>/);
  for (const id of ['64b7f0c2a1b2c3d4e5f60718', 'bad']) {
    assert.strictEqual((await admin.request(`/doctors/${id}`)).status, 404);
    assert.strictEqual((await admin.request(`/doctors/${id}/edit`)).status, 404);
    assert.strictEqual((await admin.request(`/doctors/${id}/delete`, { method: 'POST' })).status, 404);
  }
});

test('a specialty used by a doctor cannot be deleted, an unused one can', async () => {
  await add();
  const unused = await Specialty.create({ name: 'Dermatologie' });

  const blocked = await admin.request(`/specialties/${cardio.id}/delete`, { method: 'POST' });
  assert.strictEqual(blocked.status, 302);
  assert.strictEqual(await Specialty.countDocuments({ _id: cardio.id }), 1);
  const list = await admin.request('/specialties');
  assert.match(list.html, /utilisée par au moins un médecin/);
  assert.match(list.html, /alert-danger/);

  await admin.request(`/specialties/${unused.id}/delete`, { method: 'POST' });
  assert.strictEqual(await Specialty.countDocuments({ _id: unused.id }), 0);

  const doctor = await Doctor.findOne();
  await admin.request(`/doctors/${doctor.id}/delete`, { method: 'POST' });
  await admin.request(`/specialties/${cardio.id}/delete`, { method: 'POST' });
  assert.strictEqual(await Specialty.countDocuments({ _id: cardio.id }), 0);
});
