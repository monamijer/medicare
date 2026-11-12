const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const Patient = require('../src/models/Patient');
const User = require('../src/models/User');
const { createClient } = require('./helpers/http');
const { createUser, loginAs, PASSWORD } = require('./helpers/fixtures');

let admin;
const clients = [];
const newClient = () => { const c = createClient(app); clients.push(c); return c; };

test.before(async () => { await db.connect(); await Promise.all([User.init(), Patient.init()]); });
test.beforeEach(async () => {
  await db.clear();
  await createUser('admin');
  admin = newClient();
  await loginAs(admin, 'admin@clinique.test');
});
test.afterEach(() => { while (clients.length) clients.pop().close(); });
test.after(db.close);

const valid = (over = {}) => ({
  firstName: 'Jean', lastName: 'Bizimana', email: 'jean@exemple.test', password: 'motdepasse1',
  birthDate: '1990-05-17', phone: '+257 79 11 22 33', ...over,
});
const add = (over) => admin.request('/patients', { method: 'POST', form: valid(over) });

test('only admins can manage patients; doctors and patients get 403', async () => {
  for (const role of ['doctor', 'patient']) {
    await createUser(role);
    const c = newClient();
    await loginAs(c, `${role}@clinique.test`);
    assert.strictEqual((await c.request('/patients')).status, 403);
    assert.strictEqual((await c.request('/patients', { method: 'POST', form: valid() })).status, 403);
  }
  assert.strictEqual(await Patient.countDocuments(), 0);
});

test('empty state, then create shows the patient with a French date', async () => {
  assert.match((await admin.request('/patients')).html, /Aucun patient/);
  const res = await add();
  assert.strictEqual(res.status, 302);
  const patient = await Patient.findOne().populate('user');
  assert.strictEqual(patient.user.role, 'patient');
  assert.strictEqual(patient.birthDate.toISOString().slice(0, 10), '1990-05-17');
  const page = await admin.request(res.location);
  assert.match(page.html, /Patient créé\./);
  assert.match(page.html, /17\/05\/1990/);
  assert.match((await admin.request('/patients')).html, /Jean Bizimana/);
});

test('validation: bad fields, future or impossible birth dates', async () => {
  const bad = await add({ firstName: 'J', email: 'x', birthDate: '', phone: 'abc', password: 'court' });
  assert.strictEqual(bad.status, 422);
  for (const t of [/entre 2 et 60/, /e-mail valide/, /date de naissance valide/, /téléphone valide/, /au moins 8/]) assert.match(bad.html, t);
  for (const birthDate of ['2999-01-01', '1990-02-31', '1850-01-01', '17/05/1990']) {
    assert.strictEqual((await add({ birthDate })).status, 422, birthDate);
  }
  assert.strictEqual(await Patient.countDocuments(), 0);
  assert.strictEqual(await User.countDocuments({ role: 'patient' }), 0);
});

test('duplicate email is refused without leaving an account behind', async () => {
  await add();
  const dup = await add({ firstName: 'Autre' });
  assert.strictEqual(dup.status, 409);
  assert.match(dup.html, /adresse e-mail est déjà utilisée/);
  assert.strictEqual(await Patient.countDocuments(), 1);
  assert.strictEqual(await User.countDocuments({ role: 'patient' }), 1);
});

test('admin can edit (keeping the password when empty) and delete a patient', async () => {
  await add();
  const patient = await Patient.findOne();
  const form = await admin.request(`/patients/${patient.id}/edit`);
  assert.match(form.html, /value="1990-05-17"/);

  const res = await admin.request(`/patients/${patient.id}`, { method: 'POST', form: valid({ firstName: 'Jean-Paul', password: '', birthDate: '1991-01-02' }) });
  assert.strictEqual(res.status, 302);
  const updated = await Patient.findById(patient.id).populate('user');
  assert.strictEqual(updated.user.firstName, 'Jean-Paul');
  assert.strictEqual(updated.birthDate.toISOString().slice(0, 10), '1991-01-02');
  const c = newClient();
  assert.strictEqual((await loginAs(c, 'jean@exemple.test')).status, 302);

  const del = await admin.request(`/patients/${patient.id}/delete`, { method: 'POST' });
  assert.strictEqual(del.status, 302);
  assert.strictEqual(await Patient.countDocuments(), 0);
  assert.strictEqual(await User.countDocuments({ role: 'patient' }), 0);
});

test('names are escaped; unknown ids give 404', async () => {
  await add({ firstName: '<i>Jean</i>' });
  assert.doesNotMatch((await admin.request('/patients')).html, /<i>Jean<\/i>/);
  for (const id of ['64b7f0c2a1b2c3d4e5f60718', 'bad']) {
    assert.strictEqual((await admin.request(`/patients/${id}`)).status, 404);
    assert.strictEqual((await admin.request(`/patients/${id}/edit`)).status, 404);
    assert.strictEqual((await admin.request(`/patients/${id}/delete`, { method: 'POST' })).status, 404);
  }
});

test('self-registration creates a patient and logs them in', async () => {
  const visitor = newClient();
  const page = await visitor.request('/register');
  assert.strictEqual(page.status, 200);
  assert.match(page.html, /Créer mon compte/);
  assert.match((await visitor.request('/login')).html, /href="\/register"/);

  const res = await visitor.request('/register', { method: 'POST', form: valid() });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/');
  const home = await visitor.request('/');
  assert.match(home.html, /Bienvenue, Jean/);
  assert.match(home.html, /Prendre rendez-vous/);
  assert.doesNotMatch(home.html, /Spécialités/);

  const user = await User.findOne({ email: 'jean@exemple.test' });
  assert.strictEqual(user.role, 'patient');
  assert.strictEqual((await visitor.request('/register')).status, 302);
});

test('registration cannot create staff and refuses bad input or duplicates', async () => {
  const visitor = newClient();
  const res = await visitor.request('/register', { method: 'POST', form: { ...valid(), role: 'admin' } });
  assert.strictEqual(res.status, 302);
  assert.strictEqual((await User.findOne({ email: 'jean@exemple.test' })).role, 'patient');

  const other = newClient();
  const bad = await other.request('/register', { method: 'POST', form: valid({ email: 'x', password: '1' }) });
  assert.strictEqual(bad.status, 422);
  const dup = await other.request('/register', { method: 'POST', form: valid() });
  assert.strictEqual(dup.status, 409);
  assert.doesNotMatch(dup.html, /motdepasse1/);
});

test('a patient edits their own profile; the header follows', async () => {
  const me = newClient();
  await me.request('/register', { method: 'POST', form: valid() });
  const page = await me.request('/profile');
  assert.strictEqual(page.status, 200);
  assert.match(page.html, /value="Jean"/);

  const res = await me.request('/profile', { method: 'POST', form: valid({ firstName: 'Jeanne', password: '' }) });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/profile');
  const after = await me.request('/profile');
  assert.match(after.html, /Vos informations ont été enregistrées/);
  assert.match(after.html, /Jeanne Bizimana/);

  await me.request('/profile', { method: 'POST', form: valid({ password: 'nouveaumotdepasse' }) });
  const c = newClient();
  assert.strictEqual((await loginAs(c, 'jean@exemple.test', PASSWORD)).status, 401);
  assert.strictEqual((await loginAs(c, 'jean@exemple.test', 'nouveaumotdepasse')).status, 302);
});

test('a patient cannot take another account\'s email; staff and anonymous cannot use /profile', async () => {
  await createUser('patient', { email: 'pris@exemple.test' });
  const me = newClient();
  await me.request('/register', { method: 'POST', form: valid() });
  assert.strictEqual((await me.request('/profile', { method: 'POST', form: valid({ email: 'pris@exemple.test', password: '' }) })).status, 409);

  assert.strictEqual((await admin.request('/profile')).status, 403);
  const anon = newClient();
  const res = await anon.request('/profile');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/login');
});
