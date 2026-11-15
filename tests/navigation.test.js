const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const { seedDemoData } = require('../scripts/seed');
const { loginAs } = require('./helpers/fixtures');
const clinicHelpers = require('./helpers/clinic');

const { newClient, closeAll } = clinicHelpers(app);

test.before(db.connect);
test.after(async () => { closeAll(); await db.close(); });

test('every menu link of every role leads to a real page (no dead links)', async () => {
  const summary = await seedDemoData();
  const accounts = [[summary.admin, 'admin'], [summary.doctors[0], 'doctor'], [summary.patients[0], 'patient']];
  let checked = 0;
  for (const [email, role] of accounts) {
    const client = newClient();
    await loginAs(client, email, summary.password);
    const home = await client.request('/');
    const links = [...home.html.matchAll(/<a class="nav-link[^"]*" href="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(links.length >= 4, `${role} has a menu`);
    for (const href of links) {
      const res = await client.request(href);
      assert.strictEqual(res.status, 200, `${role}: menu link ${href}`);
      assert.match(res.html, /aria-current="page"/, `${role}: ${href} marks itself active`);
      checked += 1;
    }
  }
  assert.strictEqual(checked, 16); // 8 admin + 4 doctor + 4 patient menu entries
});
