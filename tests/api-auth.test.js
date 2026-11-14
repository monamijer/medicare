const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const Patient = require('../src/models/Patient');
const User = require('../src/models/User');
const { createUser, PASSWORD } = require('./helpers/fixtures');
const clinicHelpers = require('./helpers/clinic');

const { newClient, closeAll } = clinicHelpers(app);

test.before(async () => { await db.connect(); await Promise.all([User.init(), Patient.init()]); });
test.beforeEach(db.clear);
test.afterEach(closeAll);
test.after(db.close);

const api = (client, method, path, json) => client.request(`/api/v1${path}`, { method, json });
const register = (over = {}) => ({
  firstName: 'Jean', lastName: 'Bizimana', email: 'jean@exemple.test', password: 'motdepasse1', birthDate: '1990-05-17', phone: '+257 79 11 22 33', ...over,
});

test('health answers without logging in', async () => {
  const res = await api(newClient(), 'GET', '/health');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.json, { status: 'ok' });
});

test('login returns the user as JSON and starts a session', async () => {
  await createUser('admin');
  const client = newClient();
  const res = await api(client, 'POST', '/auth/login', { email: 'ADMIN@clinique.test', password: PASSWORD });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(Object.keys(res.json), ['user']);
  assert.deepStrictEqual(res.json.user, {
    id: res.json.user.id, firstName: 'Test', lastName: 'admin', fullName: 'Test admin', email: 'admin@clinique.test', role: 'admin', active: true,
  });
  const cookie = res.setCookie.find((c) => c.startsWith('medicare.sid='));
  assert.match(cookie, /HttpOnly/i);

  const me = await api(client, 'GET', '/auth/me');
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.json.user.email, 'admin@clinique.test');
});

test('wrong credentials and unknown emails give the same 401, with no session', async () => {
  await createUser('admin');
  const wrong = await api(newClient(), 'POST', '/auth/login', { email: 'admin@clinique.test', password: 'mauvais-mot-de-passe' });
  const unknown = await api(newClient(), 'POST', '/auth/login', { email: 'inconnu@clinique.test', password: PASSWORD });
  for (const res of [wrong, unknown]) {
    assert.strictEqual(res.status, 401);
    assert.deepStrictEqual(res.json, { error: { status: 401, message: 'Adresse e-mail ou mot de passe incorrect.' } });
    assert.strictEqual(res.setCookie.length, 0);
  }
});

test('invalid input gives 422 with a message per field', async () => {
  const res = await api(newClient(), 'POST', '/auth/login', { email: 'pas-un-email', password: '' });
  assert.strictEqual(res.status, 422);
  assert.strictEqual(res.json.error.status, 422);
  assert.match(res.json.error.fields.email, /adresse e-mail valide/);
  assert.match(res.json.error.fields.password, /mot de passe/);
  const empty = await api(newClient(), 'POST', '/auth/login');
  assert.strictEqual(empty.status, 422);
});

test('a deactivated account cannot log in', async () => {
  await createUser('doctor');
  await User.updateOne({ email: 'doctor@clinique.test' }, { active: false });
  assert.strictEqual((await api(newClient(), 'POST', '/auth/login', { email: 'doctor@clinique.test', password: PASSWORD })).status, 401);
});

test('/auth/me needs a session; logout ends it', async () => {
  await createUser('admin');
  const client = newClient();
  const anonymous = await api(client, 'GET', '/auth/me');
  assert.strictEqual(anonymous.status, 401);
  assert.deepStrictEqual(anonymous.json, { error: { status: 401, message: 'Authentification requise.' } });

  await api(client, 'POST', '/auth/login', { email: 'admin@clinique.test', password: PASSWORD });
  const oldJar = new Map(client.jar);
  const out = await api(client, 'POST', '/auth/logout');
  assert.strictEqual(out.status, 204);
  assert.strictEqual(out.html, '');
  assert.strictEqual((await api(client, 'GET', '/auth/me')).status, 401);

  const replay = newClient();
  for (const [name, value] of oldJar) replay.jar.set(name, value);
  assert.strictEqual((await api(replay, 'GET', '/auth/me')).status, 401); // the old cookie is dead
  assert.strictEqual((await api(newClient(), 'POST', '/auth/logout')).status, 204); // logging out twice is fine
});

test('registration creates a patient, signs them in, and refuses duplicates', async () => {
  const client = newClient();
  const res = await api(client, 'POST', '/auth/register', register({ role: 'admin' }));
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.json.user.role, 'patient'); // a submitted role is ignored
  assert.strictEqual(await Patient.countDocuments(), 1);
  assert.strictEqual((await api(client, 'GET', '/auth/me')).json.user.email, 'jean@exemple.test');

  const dup = await api(newClient(), 'POST', '/auth/register', register());
  assert.strictEqual(dup.status, 409);
  assert.match(dup.json.error.fields.email, /déjà utilisée/);
  assert.strictEqual(await Patient.countDocuments(), 1);
});

test('registration validates every field', async () => {
  const res = await api(newClient(), 'POST', '/auth/register', register({ firstName: 'J', email: 'x', birthDate: '2999-01-01', password: 'court', phone: 'abc' }));
  assert.strictEqual(res.status, 422);
  for (const field of ['firstName', 'email', 'birthDate', 'password', 'phone']) assert.ok(res.json.error.fields[field], field);
  assert.strictEqual(await User.countDocuments(), 0);
});

test('no response ever contains a password or a hash', async () => {
  await createUser('admin');
  const client = newClient();
  const responses = [
    await api(client, 'POST', '/auth/login', { email: 'admin@clinique.test', password: PASSWORD }),
    await api(client, 'GET', '/auth/me'),
    await api(newClient(), 'POST', '/auth/register', register()),
  ];
  for (const res of responses) {
    assert.doesNotMatch(res.html, /passwordHash|\$2[aby]\$/);
    assert.doesNotMatch(res.html, new RegExp(PASSWORD));
    assert.doesNotMatch(res.html, /motdepasse1/);
  }
});

test('non-JSON bodies get 415, broken JSON gets 400, unknown routes get a JSON 404', async () => {
  const form = await newClient().request('/api/v1/auth/login', { method: 'POST', form: { email: 'a@b.test', password: 'x' } });
  assert.strictEqual(form.status, 415);
  assert.strictEqual(form.json.error.status, 415);

  const broken = await newClient().request('/api/v1/auth/login', { method: 'POST', raw: '{"email": ' });
  assert.strictEqual(broken.status, 400);
  assert.strictEqual(broken.json.error.message, 'Corps de requête JSON invalide.');

  const missing = await api(newClient(), 'GET', '/nimporte-quoi');
  assert.strictEqual(missing.status, 404);
  assert.strictEqual(missing.json.error.status, 404);
});
