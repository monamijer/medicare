const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const User = require('../src/models/User');
const userService = require('../src/services/userService');

const valid = { email: 'Admin@Clinique.test ', password: 'motdepasse1', role: 'admin', firstName: 'Awa', lastName: 'Ndayi' };

test.before(async () => { await db.connect(); await User.init(); });
test.beforeEach(db.clear);
test.after(db.close);

test('createUser hashes the password and normalises the email', async () => {
  const user = await userService.createUser(valid);
  const stored = await User.findById(user.id).select('+passwordHash');
  assert.strictEqual(stored.email, 'admin@clinique.test');
  assert.notStrictEqual(stored.passwordHash, valid.password);
  assert.match(stored.passwordHash, /^\$2[aby]\$/);
});

test('passwordHash is never exposed by default or in JSON', async () => {
  await userService.createUser(valid);
  const found = await User.findOne({ email: 'admin@clinique.test' });
  assert.strictEqual(found.passwordHash, undefined);
  const withHash = await User.findOne({}).select('+passwordHash');
  assert.strictEqual(JSON.parse(JSON.stringify(withHash)).passwordHash, undefined);
  assert.strictEqual(found.fullName, 'Awa Ndayi');
});

test('rejects short passwords, bad roles and duplicate emails', async () => {
  await assert.rejects(userService.createUser({ ...valid, password: 'court' }), { status: 422 });
  await assert.rejects(userService.createUser({ ...valid, role: 'root' }), { status: 422 });
  await userService.createUser(valid);
  await assert.rejects(userService.createUser({ ...valid, email: 'ADMIN@clinique.test' }), { status: 409 });
});
