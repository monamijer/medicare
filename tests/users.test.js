const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const User = require('../src/models/User');
const { seedDemoData } = require('../scripts/seed');
const { loginAs, PASSWORD } = require('./helpers/fixtures');
const clinicHelpers = require('./helpers/clinic');

const { newClient, closeAll } = clinicHelpers(app);
let summary;
let admin;

test.before(db.connect);
test.beforeEach(async () => {
  await db.clear();
  summary = await seedDemoData();
  admin = newClient();
  await loginAs(admin, summary.admin, summary.password);
});
test.afterEach(closeAll);
test.after(db.close);

const post = (client, path, form) => client.request(path, { method: 'POST', form });
const newAdmin = (over = {}) => ({ firstName: 'Nadine', lastName: 'Cishahayo', email: 'nadine@medicare.test', password: 'motdepasse1', ...over });

test('only admins see users; doctors, patients get 403; anonymous users go to login', async () => {
  for (const email of [summary.doctors[0], summary.patients[0]]) {
    const c = newClient();
    await loginAs(c, email, summary.password);
    assert.strictEqual((await c.request('/users')).status, 403);
    assert.strictEqual((await post(c, '/users', newAdmin())).status, 403);
  }
  const res = await newClient().request('/users');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/login');
});

test('the list shows every account with role, status and links to doctor and patient records', async () => {
  const { html, status } = await admin.request('/users');
  assert.strictEqual(status, 200);
  assert.strictEqual((html.match(/<tr>/g) || []).length, 1 + 15); // header + 1 admin + 6 doctors + 8 patients
  for (const text of [/Admin MediCare/, /\(vous\)/, /Administrateur/, /Médecin/, /Patient/, /Actif/, /Voir la fiche/]) assert.match(html, text);
  assert.match(html, /href="\/doctors\/[0-9a-f]{24}"/);
  assert.match(html, /href="\/patients\/[0-9a-f]{24}"/);
  assert.doesNotMatch(html, /passwordHash|\$2[aby]\$/);
});

test('an admin creates another administrator who can sign in', async () => {
  const res = await post(admin, '/users', newAdmin());
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/users');
  assert.match((await admin.request('/users')).html, /Administrateur « Nadine Cishahayo » créé\./);
  const user = await User.findOne({ email: 'nadine@medicare.test' });
  assert.strictEqual(user.role, 'admin');
  const second = newClient();
  assert.strictEqual((await loginAs(second, 'nadine@medicare.test', 'motdepasse1')).status, 302);
  assert.match((await second.request('/')).html, /Administrateur/);
});

test('creating an administrator validates input and refuses duplicate emails', async () => {
  const bad = await post(admin, '/users', newAdmin({ firstName: 'N', email: 'x', password: 'court' }));
  assert.strictEqual(bad.status, 422);
  for (const text of [/entre 2 et 60/, /adresse e-mail valide/, /au moins 8/]) assert.match(bad.html, text);
  assert.match(bad.html, /value="x"/);
  const dup = await post(admin, '/users', newAdmin({ email: summary.patients[0] }));
  assert.strictEqual(dup.status, 409);
  assert.match(dup.html, /déjà utilisée/);
  assert.strictEqual(await User.countDocuments({ role: 'admin' }), 1);
});

test('deactivating an administrator ends their access at once; reactivating restores it', async () => {
  await post(admin, '/users', newAdmin());
  const second = newClient();
  await loginAs(second, 'nadine@medicare.test', 'motdepasse1');
  const other = await User.findOne({ email: 'nadine@medicare.test' });

  assert.strictEqual((await post(admin, `/users/${other.id}/deactivate`)).status, 302);
  assert.match((await admin.request('/users')).html, /désactivé/);
  assert.strictEqual((await second.request('/users')).status, 302); // their open session is dead
  assert.strictEqual((await loginAs(newClient(), 'nadine@medicare.test', 'motdepasse1')).status, 401);

  await post(admin, `/users/${other.id}/reactivate`);
  assert.strictEqual((await loginAs(newClient(), 'nadine@medicare.test', 'motdepasse1')).status, 302);
});

test('you cannot deactivate your own account', async () => {
  const me = await User.findOne({ email: summary.admin });
  await post(admin, `/users/${me.id}/deactivate`);
  assert.match((await admin.request('/users')).html, /ne pouvez pas désactiver votre propre compte/);
  assert.strictEqual((await User.findById(me.id)).active, true);
  assert.doesNotMatch((await admin.request('/users')).html, new RegExp(`/users/${me.id}/deactivate`)); // no button for yourself
});

test('two administrators deactivating each other at the same moment never lock everyone out', async () => {
  await post(admin, '/users', newAdmin());
  const [first, second] = [await User.findOne({ email: summary.admin }), await User.findOne({ email: 'nadine@medicare.test' })];
  const secondClient = newClient();
  await loginAs(secondClient, 'nadine@medicare.test', 'motdepasse1');

  for (let i = 0; i < 6; i += 1) {
    await User.updateMany({ role: 'admin' }, { active: true });
    await Promise.all([post(admin, `/users/${second.id}/deactivate`), post(secondClient, `/users/${first.id}/deactivate`)]);
    assert.ok(await User.countDocuments({ role: 'admin', active: true }) >= 1, `iteration ${i}`);
    // whichever request lost had its session killed or was refused; sign both in again for the next round
    await User.updateMany({ role: 'admin' }, { active: true });
    await loginAs(admin, summary.admin, summary.password);
    await loginAs(secondClient, 'nadine@medicare.test', 'motdepasse1');
  }
});

test('the safety net undoes a deactivation that would leave no active administrator', async () => {
  const userService = require('../src/services/userService');
  await post(admin, '/users', newAdmin());
  const [first, second] = [await User.findOne({ email: summary.admin }), await User.findOne({ email: 'nadine@medicare.test' })];

  // Simulate the race: the check before sees another active admin, the check after sees none.
  const original = User.countDocuments;
  let calls = 0;
  User.countDocuments = async () => { calls += 1; return calls === 1 ? 1 : 0; };
  try {
    await assert.rejects(userService.setAdminActive(first.id, second.id, false), { status: 409, message: /au moins un administrateur actif/ });
  } finally {
    User.countDocuments = original;
  }
  assert.strictEqual(calls, 2);
  assert.strictEqual((await User.findById(second.id)).active, true); // undone
});

test('doctor and patient accounts cannot be switched off here, and unknown ids give 404', async () => {
  const doctor = await User.findOne({ email: summary.doctors[0] });
  const res = await post(admin, `/users/${doctor.id}/deactivate`);
  assert.strictEqual(res.status, 302);
  assert.match((await admin.request('/users')).html, /se gèrent depuis leur section/);
  assert.strictEqual((await User.findById(doctor.id)).active, true);
  for (const id of ['64b7f0c2a1b2c3d4e5f60718', 'bad']) {
    assert.strictEqual((await post(admin, `/users/${id}/deactivate`)).status, 404);
    assert.strictEqual((await post(admin, `/users/${id}/reactivate`)).status, 404);
  }
});

test('the admin menu entry now leads somewhere and is the active item on the page', async () => {
  const { html } = await admin.request('/users');
  assert.strictEqual((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /aria-current="page"[^>]*>[\s\S]*?Utilisateurs/);
  assert.ok(PASSWORD);
});
