const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const app = require('../src/app');
const Appointment = require('../src/models/Appointment');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const Slot = require('../src/models/AvailabilitySlot');
const Specialty = require('../src/models/Specialty');
const User = require('../src/models/User');
const { seedDemoData } = require('../scripts/seed');
const { createUser, loginAs, PASSWORD } = require('./helpers/fixtures');
const { api } = require('./helpers/api');
const clinicHelpers = require('./helpers/clinic');

const { newClient, closeAll } = clinicHelpers(app);
const PUBLIC_DIR = path.join(__dirname, '../src/public');

test.before(db.connect);
test.beforeEach(db.clear);
test.afterEach(closeAll);
test.after(db.close);

test('security headers are sent on pages, API responses and static files', async () => {
  const client = newClient();
  for (const url of ['/login', '/api/v1/health', '/css/main.css', '/nimporte-quoi']) {
    const res = await client.request(url);
    const h = res.headers;
    assert.match(h.get('content-security-policy'), /default-src 'self'/, url);
    assert.match(h.get('content-security-policy'), /script-src 'self'/, url);
    assert.match(h.get('content-security-policy'), /frame-ancestors 'none'/, url);
    assert.doesNotMatch(h.get('content-security-policy'), /unsafe-inline|unsafe-eval|https?:/, url);
    assert.strictEqual(h.get('x-content-type-options'), 'nosniff', url);
    assert.strictEqual(h.get('x-frame-options'), 'DENY', url);
    assert.strictEqual(h.get('referrer-policy'), 'same-origin', url);
    assert.strictEqual(h.get('x-powered-by'), null, url);
  }
});

test('state-changing requests from another site are refused (web and API)', async () => {
  await createUser('admin');
  const client = newClient();
  const own = new URL(client.base).host;
  const foreign = { headers: { origin: 'http://evil.example' } };

  const web = await client.request('/login', { method: 'POST', form: { email: 'admin@clinique.test', password: PASSWORD }, ...foreign });
  assert.strictEqual(web.status, 403);
  assert.strictEqual(web.setCookie.length, 0);
  assert.match(web.html, /ne provient pas de ce site/);

  const json = await client.request('/api/v1/auth/login', { method: 'POST', json: { email: 'admin@clinique.test', password: PASSWORD }, ...foreign });
  assert.strictEqual(json.status, 403);
  assert.deepStrictEqual(Object.keys(json.json.error), ['status', 'message']);
  assert.strictEqual(json.setCookie.length, 0);

  for (const origin of ['null', 'not a url', `http://${own}.evil.example`, 'http://localhost:1']) {
    const res = await client.request('/api/v1/auth/logout', { method: 'POST', headers: { origin } });
    assert.strictEqual(res.status, 403, origin);
  }

  // Same-origin browsers, and tools that send no Origin at all, still work.
  const sameOrigin = await client.request('/api/v1/auth/login', { method: 'POST', json: { email: 'admin@clinique.test', password: PASSWORD }, headers: { origin: `http://${own}` } });
  assert.strictEqual(sameOrigin.status, 200);
  const noOrigin = await newClient().request('/api/v1/auth/login', { method: 'POST', json: { email: 'admin@clinique.test', password: PASSWORD } });
  assert.strictEqual(noOrigin.status, 200);
});

test('a foreign site cannot make a signed-in user act: cancel, delete and logout are refused', async () => {
  const summary = await seedDemoData();
  const admin = newClient();
  await loginAs(admin, summary.admin, summary.password);
  const doctor = await Doctor.findOne();
  const appointment = await Appointment.findOne({ status: 'confirmed' });
  const foreign = { headers: { origin: 'https://evil.example' } };

  for (const url of [`/doctors/${doctor.id}/delete`, `/appointments/${appointment.id}/cancel`, '/logout']) {
    assert.strictEqual((await admin.request(url, { method: 'POST', ...foreign })).status, 403, url);
  }
  assert.strictEqual(await Doctor.countDocuments({ _id: doctor.id }), 1);
  assert.strictEqual((await Appointment.findById(appointment.id)).status, 'confirmed');
  assert.strictEqual((await admin.request('/doctors')).status, 200); // still signed in
  assert.strictEqual((await admin.request(`/appointments/${appointment.id}/cancel`, { method: 'POST', headers: { origin: `http://${new URL(admin.base).host}` } })).status, 302);
});

test('GET requests are never blocked by Origin', async () => {
  const res = await newClient().request('/login', { headers: { origin: 'http://anywhere.example' } });
  assert.strictEqual(res.status, 200);
});

// ---- Every page is compatible with the strict policy and works offline ----

const BAD = [
  [/<script(?![^>]*\bsrc=)[^>]*>/i, 'inline <script>'],
  [/<style[\s>]/i, '<style> element'],
  [/\sstyle\s*=/i, 'style="" attribute'],
  [/\son[a-z]+\s*=\s*["']/i, 'inline event handler'],
  [/(?:href|src|action)\s*=\s*["']https?:\/\//i, 'external URL'],
  [/<link[^>]+rel=["']?(?:preconnect|dns-prefetch)/i, 'external hint'],
];

test('no page uses inline code or external resources, and every icon exists', async () => {
  const summary = await seedDemoData();
  const sprite = fs.readFileSync(path.join(PUBLIC_DIR, 'assets/icons.svg'), 'utf8');
  const spriteIds = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
  const usedIcons = new Set();

  const doctor = await Doctor.findOne().populate('user');
  const patient = await Patient.findOne({ user: (await User.findOne({ email: summary.patients[0] })).id });
  const specialty = await Specialty.findOne();
  const slot = await Slot.findOne({ doctor: doctor.id, status: 'free', start: { $gt: new Date() } });
  const mine = await Appointment.findOne({ patient: patient.id, status: 'confirmed', start: { $gt: new Date() } });
  assert.ok(mine, 'the demo patient has an upcoming appointment');

  const visits = [
    [summary.admin, ['/', '/specialties', '/specialties/new', `/specialties/${specialty.id}/edit`, '/doctors', '/doctors/new',
      `/doctors/${doctor.id}`, `/doctors/${doctor.id}/edit`, '/patients', '/patients/new', `/patients/${patient.id}`, `/patients/${patient.id}/edit`,
      '/availability', `/availability?doctor=${doctor.id}`, `/availability/new?doctor=${doctor.id}`, `/availability/${slot.id}/edit?doctor=${doctor.id}`,
      '/appointments', '/appointments/day', `/appointments/${mine.id}/edit`, '/nimporte-quoi']],
    [doctor.user.email, ['/', '/appointments', '/appointments/day', '/availability', '/availability/new']],
    [summary.patients[0], ['/', '/profile', '/appointments', `/appointments/new?specialty=${specialty.id}`, `/appointments/new/${doctor.id}`,
      `/appointments/book/${slot.id}`, `/appointments/${mine.id}/edit`]],
    [null, ['/login', '/register']],
  ];

  let pages = 0;
  for (const [email, urls] of visits) {
    const client = newClient();
    if (email) await loginAs(client, email, summary.password);
    for (const url of urls) {
      const res = await client.request(url);
      assert.ok([200, 404].includes(res.status), `${email} ${url} -> ${res.status}`);
      assert.match(res.html, /<html[^>]*\blang="fr"/, url);
      for (const [pattern, label] of BAD) assert.doesNotMatch(res.html, pattern, `${url}: ${label}`);
      for (const m of res.html.matchAll(/<use href="\/assets\/icons\.svg#([^"]+)"/g)) usedIcons.add(m[1]);
      pages += 1;
    }
  }
  assert.ok(pages > 30);
  assert.ok(usedIcons.size > 10);
  for (const icon of usedIcons) assert.ok(spriteIds.has(icon), `icon "${icon}" missing from the sprite`);
});

test('stylesheets and scripts are self-contained and every asset they reference is served', async () => {
  const client = newClient();
  const read = (dir) => fs.readdirSync(path.join(PUBLIC_DIR, dir)).map((f) => [`/${dir}/${f}`, fs.readFileSync(path.join(PUBLIC_DIR, dir, f), 'utf8')]);

  for (const [url, css] of read('css')) {
    assert.doesNotMatch(css, /@import|url\(\s*["']?(?:https?:)?\/\//i, `${url} must not load anything external`);
    for (const m of css.matchAll(/url\(\s*["']?(\/[^"')\s]+)["']?\s*\)/g)) {
      assert.strictEqual((await client.request(m[1])).status, 200, `${url} references ${m[1]}`);
    }
    assert.strictEqual((await client.request(url)).status, 200);
  }
  for (const [url, js] of read('js')) {
    assert.doesNotMatch(js, /https?:\/\//, `${url} must not mention external URLs`);
    assert.doesNotMatch(js, /\beval\s*\(|new Function\s*\(|innerHTML\s*=/, `${url} uses an unsafe construct`);
    assert.strictEqual((await client.request(url)).status, 200);
  }
  const sprite = await client.request('/assets/icons.svg');
  assert.strictEqual(sprite.status, 200);
  assert.ok(sprite.headers.get('content-type').includes('svg'));
});

test('the API is untouched by the policy: JSON still works end to end', async () => {
  const summary = await seedDemoData();
  const client = newClient();
  const login = await api(client, 'POST', '/auth/login', { email: summary.admin, password: summary.password });
  assert.strictEqual(login.status, 200);
  assert.strictEqual((await api(client, 'GET', '/doctors')).json.doctors.length, 6);
});
