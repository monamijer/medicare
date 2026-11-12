const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const Specialty = require('../src/models/Specialty');
const User = require('../src/models/User');
const { createClient } = require('./helpers/http');
const { createUser, loginAs } = require('./helpers/fixtures');

let admin;

test.before(async () => { await db.connect(); await User.init(); await Specialty.init(); });
test.beforeEach(async () => {
  await db.clear();
  await createUser('admin');
  admin = createClient(app);
  await loginAs(admin, 'admin@clinique.test');
});
test.afterEach(() => admin.close());
test.after(db.close);

const add = (name) => admin.request('/specialties', { method: 'POST', form: { name } });
const names = async () => (await Specialty.find().lean()).map((s) => s.name);

test('only admins can open specialties', async () => {
  const anonymous = createClient(app);
  const res = await anonymous.request('/specialties');
  anonymous.close();
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/login');

  await createUser('patient');
  const patient = createClient(app);
  await loginAs(patient, 'patient@clinique.test');
  assert.strictEqual((await patient.request('/specialties')).status, 403);
  assert.strictEqual((await patient.request('/specialties', { method: 'POST', form: { name: 'Intrus' } })).status, 403);
  patient.close();
  assert.deepStrictEqual(await names(), []);
});

test('shows an empty state, then lists specialties alphabetically', async () => {
  assert.match((await admin.request('/specialties')).html, /Aucune spécialité/);
  for (const name of ['Pédiatrie', 'Cardiologie', 'Dermatologie']) await add(name);
  const { html } = await admin.request('/specialties');
  assert.doesNotMatch(html, /Aucune spécialité/);
  const order = ['Cardiologie', 'Dermatologie', 'Pédiatrie'].map((n) => html.indexOf(`<td>${n}</td>`));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2]);
});

test('creating a specialty redirects with a success message', async () => {
  const res = await add('  Cardiologie ');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/specialties');
  assert.deepStrictEqual(await names(), ['Cardiologie']);
  const list = await admin.request('/specialties');
  assert.match(list.html, /Spécialité « Cardiologie » créée\./);
});

test('rejects invalid names and keeps what was typed', async () => {
  const res = await add('A');
  assert.strictEqual(res.status, 422);
  assert.match(res.html, /entre 2 et 80 caractères/);
  assert.match(res.html, /aria-invalid="true"/);
  assert.deepStrictEqual(await names(), []);
});

test('duplicates are refused ignoring case and accents', async () => {
  await add('Pédiatrie');
  for (const dup of ['pédiatrie', 'PEDIATRIE', 'Pediatrie']) {
    const res = await add(dup);
    assert.strictEqual(res.status, 409);
    assert.match(res.html, /Cette spécialité existe déjà/);
  }
  assert.deepStrictEqual(await names(), ['Pédiatrie']);
});

test('names are escaped in the page', async () => {
  await add('<script>alert(1)</script>');
  const { html } = await admin.request('/specialties');
  assert.doesNotMatch(html, /<script>alert\(1\)/);
  assert.match(html, /&lt;script&gt;alert\(1\)/);
});

test('editing renames a specialty and refuses a duplicate name', async () => {
  await add('Cardiologie');
  await add('Dermatologie');
  const card = await Specialty.findOne({ name: 'Cardiologie' });

  const form = await admin.request(`/specialties/${card.id}/edit`);
  assert.strictEqual(form.status, 200);
  assert.match(form.html, /value="Cardiologie"/);

  const clash = await admin.request(`/specialties/${card.id}`, { method: 'POST', form: { name: 'dermatologie' } });
  assert.strictEqual(clash.status, 409);

  const ok = await admin.request(`/specialties/${card.id}`, { method: 'POST', form: { name: 'Cardiologie adulte' } });
  assert.strictEqual(ok.status, 302);
  assert.deepStrictEqual((await names()).sort(), ['Cardiologie adulte', 'Dermatologie']);
  assert.match((await admin.request('/specialties')).html, /modifiée/);
});

test('saving a specialty under its own name is allowed', async () => {
  await add('Cardiologie');
  const card = await Specialty.findOne();
  const res = await admin.request(`/specialties/${card.id}`, { method: 'POST', form: { name: 'Cardiologie' } });
  assert.strictEqual(res.status, 302);
});

test('deleting removes the specialty and confirms', async () => {
  await add('Cardiologie');
  const card = await Specialty.findOne();
  const res = await admin.request(`/specialties/${card.id}/delete`, { method: 'POST' });
  assert.strictEqual(res.status, 302);
  assert.deepStrictEqual(await names(), []);
  assert.match((await admin.request('/specialties')).html, /supprimée/);
});

test('unknown or malformed ids give a 404', async () => {
  for (const id of ['64b7f0c2a1b2c3d4e5f60718', 'not-an-id']) {
    assert.strictEqual((await admin.request(`/specialties/${id}/edit`)).status, 404);
    assert.strictEqual((await admin.request(`/specialties/${id}`, { method: 'POST', form: { name: 'Valide' } })).status, 404);
    assert.strictEqual((await admin.request(`/specialties/${id}/delete`, { method: 'POST' })).status, 404);
  }
});
