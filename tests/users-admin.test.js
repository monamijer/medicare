const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const User = require('../src/models/User');
const userService = require('../src/services/userService');
const { createClient } = require('./helpers/http');
const { createUser, loginAs } = require('./helpers/fixtures');

let client;

test.before(async () => { await db.connect(); await User.init(); });
test.beforeEach(async () => { await db.clear(); client = createClient(app); });
test.afterEach(() => client.close());
test.after(db.close);

test('anonymous users are redirected to the login page', async () => {
  const res = await client.request('/users');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/login');
});

test('non-admin users get 403 on /users', async () => {
  const patient = await createUser('patient');
  await loginAs(client, patient.email);
  const res = await client.request('/users');
  assert.strictEqual(res.status, 403);
  assert.match(res.html, /Erreur 403/);
});

test('admin sees every account with role and status', async () => {
  const admin = await createUser('admin');
  await createUser('doctor');
  await loginAs(client, admin.email);
  const res = await client.request('/users');
  assert.strictEqual(res.status, 200);
  assert.match(res.html, /Utilisateurs/);
  assert.match(res.html, new RegExp(admin.email.replace('.', '\\.')));
  assert.match(res.html, /Médecin/);
  assert.match(res.html, /Vous/);
});

test('new-admin form renders and an unknown id is a 404', async () => {
  const admin = await createUser('admin');
  await loginAs(client, admin.email);
  assert.strictEqual((await client.request('/users/new')).status, 200);
  assert.strictEqual((await client.request('/users/not-an-id/edit')).status, 404);
});

test('userService.list is sorted by last name and get rejects bad ids', async () => {
  const base = { password: 'motdepasse1', role: 'admin' };
  await userService.createUser({ ...base, email: 'z@clinique.test', firstName: 'Zoe', lastName: 'Zola' });
  await userService.createUser({ ...base, email: 'a@clinique.test', firstName: 'Abel', lastName: 'Adams' });
  const names = (await userService.list()).map((u) => u.lastName);
  assert.deepStrictEqual(names, ['Adams', 'Zola']);
  await assert.rejects(userService.get('nope'), { status: 404 });
});
