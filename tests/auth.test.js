const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const User = require('../src/models/User');
const { createClient } = require('./helpers/http');
const { PASSWORD, createUser, loginAs } = require('./helpers/fixtures');

let client;

test.before(async () => { await db.connect(); await User.init(); });
test.beforeEach(async () => { await db.clear(); client = createClient(app); });
test.afterEach(() => client.close());
test.after(db.close);

test('login page renders the form without sidebar', async () => {
  const { status, html } = await client.request('/login');
  assert.strictEqual(status, 200);
  assert.match(html, /Se connecter/);
  assert.doesNotMatch(html, /id="sidebar"/);
});

test('wrong password and unknown email give the same generic error', async () => {
  await createUser('admin');
  const wrong = await loginAs(client, 'admin@clinique.test', 'mauvais-mot-de-passe');
  const unknown = await loginAs(client, 'inconnu@clinique.test');
  for (const res of [wrong, unknown]) {
    assert.strictEqual(res.status, 401);
    assert.match(res.html, /Adresse e-mail ou mot de passe incorrect\./);
    assert.strictEqual(res.setCookie.length, 0);
  }
});

test('invalid input is rejected with a clear message', async () => {
  const badEmail = await loginAs(client, 'pas-un-email');
  assert.strictEqual(badEmail.status, 422);
  assert.match(badEmail.html, /adresse e-mail valide/);
  const noPassword = await client.request('/login', { method: 'POST', form: { email: 'a@b.test', password: '' } });
  assert.strictEqual(noPassword.status, 422);
  assert.match(noPassword.html, /Saisissez votre mot de passe/);
});

test('deactivated accounts cannot log in', async () => {
  await createUser('doctor');
  await User.updateOne({ email: 'doctor@clinique.test' }, { active: false });
  const res = await loginAs(client, 'doctor@clinique.test');
  assert.strictEqual(res.status, 401);
});

test('successful login redirects home, sets a secure cookie and shows the user', async () => {
  await createUser('admin');
  const login = await loginAs(client, 'Admin@Clinique.test');
  assert.strictEqual(login.status, 302);
  assert.strictEqual(login.location, '/');
  const cookie = login.setCookie.find((c) => c.startsWith('medicare.sid='));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);

  const home = await client.request('/');
  assert.match(home.html, /Test admin/);
  assert.match(home.html, /id="sidebar-toggle"/);

  const again = await client.request('/login');
  assert.strictEqual(again.status, 302);
});

test('logout ends the session and the old cookie stops working', async () => {
  await createUser('admin');
  await loginAs(client, 'admin@clinique.test');
  const oldJar = new Map(client.jar);

  const out = await client.request('/logout', { method: 'POST' });
  assert.strictEqual(out.status, 302);
  assert.strictEqual(out.location, '/login');

  const replay = createClient(app);
  for (const [name, value] of oldJar) replay.jar.set(name, value);
  const home = await replay.request('/');
  replay.close();
  assert.doesNotMatch(home.html, /id="sidebar"/);
});

test('password is never present in any rendered page', async () => {
  await createUser('admin');
  await loginAs(client, 'admin@clinique.test');
  const home = await client.request('/');
  assert.doesNotMatch(home.html, new RegExp(PASSWORD));
  assert.doesNotMatch(home.html, /\$2[aby]\$/);
});
