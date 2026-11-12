const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const User = require('../src/models/User');
const { getNavigation } = require('../src/utils/navigation');
const { createClient } = require('./helpers/http');
const { createUser, loginAs } = require('./helpers/fixtures');

let client;

test.before(async () => { await db.connect(); await User.init(); });
test.beforeEach(async () => { await db.clear(); client = createClient(app); });
test.afterEach(() => client.close());
test.after(db.close);

async function homeAs(role) {
  const user = await createUser(role);
  await loginAs(client, user.email);
  return (await client.request('/')).html;
}

test('getNavigation marks only the longest matching item as active', () => {
  const active = getNavigation('patient', '/appointments/new').filter((i) => i.active);
  assert.deepStrictEqual(active.map((i) => i.href), ['/appointments/new']);
  const home = getNavigation('admin', '/').filter((i) => i.active);
  assert.deepStrictEqual(home.map((i) => i.href), ['/']);
  assert.deepStrictEqual(getNavigation('unknown', '/'), []);
});

test('admin sees hamburger, full menu, active link, role and footer', async () => {
  const html = await homeAs('admin');
  assert.match(html, /lang="fr"/);
  assert.match(html, /id="sidebar-toggle"/);
  assert.match(html, /Médecins/);
  assert.match(html, /Spécialités/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /Administrateur/);
  assert.match(html, /Version 0\.1\.0/);
});

test('doctor and patient menus are role specific', async () => {
  const doctor = await homeAs('doctor');
  assert.match(doctor, /Mes disponibilités/);
  assert.doesNotMatch(doctor, /Spécialités/);
  await db.clear();
  client.jar.clear();
  const patient = await homeAs('patient');
  assert.match(patient, /Prendre rendez-vous/);
  assert.doesNotMatch(patient, /Mes disponibilités/);
});
