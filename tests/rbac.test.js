const db = require('./helpers/setup');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const realApp = require('../src/app');
const User = require('../src/models/User');
const { createSessionMiddleware } = require('../src/config/session');
const viewLocals = require('../src/middleware/viewLocals');
const { requireAuth, requireRole } = require('../src/middleware/auth');
const { notFound, errorHandler } = require('../src/middleware/errorHandler');
const { createClient } = require('./helpers/http');
const { createUser, loginAs } = require('./helpers/fixtures');

// A small app with protected routes. It shares the session store and secret with the
// real app, so a cookie obtained by logging in to the real app is valid here too.
function protectedApp() {
  const app = express();
  app.set('view engine', 'pug');
  app.set('views', path.join(__dirname, '../src/views'));
  app.use(createSessionMiddleware());
  app.use(viewLocals);
  app.get('/admin-only', requireAuth, requireRole('admin'), (req, res) => res.send('secret admin page'));
  app.get('/api/v1/admin-only', requireAuth, requireRole('admin'), (req, res) => res.json({ ok: true }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

let real;
let guarded;

test.before(async () => { await db.connect(); await User.init(); });
test.beforeEach(async () => { await db.clear(); real = createClient(realApp); guarded = createClient(protectedApp()); });
test.afterEach(() => { real.close(); guarded.close(); });
test.after(db.close);

async function loginAsRole(role) {
  const user = await createUser(role);
  await loginAs(real, user.email);
  for (const [name, value] of real.jar) guarded.jar.set(name, value);
}

test('anonymous users are redirected (web) or get 401 JSON (API)', async () => {
  const web = await guarded.request('/admin-only');
  assert.strictEqual(web.status, 302);
  assert.strictEqual(web.location, '/login');
  const api = await guarded.request('/api/v1/admin-only');
  assert.strictEqual(api.status, 401);
  assert.strictEqual(JSON.parse(api.html).error.status, 401);
});

test('a user with the wrong role gets 403 on web and API', async () => {
  await loginAsRole('patient');
  const web = await guarded.request('/admin-only');
  assert.strictEqual(web.status, 403);
  assert.match(web.html, /Erreur 403/);
  assert.doesNotMatch(web.html, /secret admin page/);
  const api = await guarded.request('/api/v1/admin-only');
  assert.strictEqual(api.status, 403);
});

test('a user with the right role is allowed', async () => {
  await loginAsRole('admin');
  const web = await guarded.request('/admin-only');
  assert.strictEqual(web.status, 200);
  assert.strictEqual(web.html, 'secret admin page');
});

test('deactivating a user ends their access immediately', async () => {
  await loginAsRole('admin');
  await User.updateOne({ email: 'admin@clinique.test' }, { active: false });
  const web = await guarded.request('/admin-only');
  assert.strictEqual(web.status, 302);
  assert.strictEqual(web.location, '/login');
  const home = await real.request('/');
  assert.strictEqual(home.status, 302);
});

test('a role change in the database applies without logging in again', async () => {
  await loginAsRole('admin');
  await User.updateOne({ email: 'admin@clinique.test' }, { role: 'patient' });
  const web = await guarded.request('/admin-only');
  assert.strictEqual(web.status, 403);
});
