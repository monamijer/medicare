const test = require('node:test');
const assert = require('node:assert');
const config = require('../src/config/env');
const app = require('../src/app');
const { getNavigation } = require('../src/utils/navigation');

async function get(path) {
  const server = app.listen(0);
  const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
  const html = await res.text();
  server.close();
  return { res, html };
}

test('getNavigation marks only the longest matching item as active', () => {
  const active = getNavigation('patient', '/appointments/new').filter((i) => i.active);
  assert.deepStrictEqual(active.map((i) => i.href), ['/appointments/new']);
  const home = getNavigation('admin', '/').filter((i) => i.active);
  assert.deepStrictEqual(home.map((i) => i.href), ['/']);
  assert.deepStrictEqual(getNavigation('unknown', '/'), []);
});

test('without a user there is no sidebar and no hamburger', async () => {
  config.devPreviewRole = '';
  const { html } = await get('/');
  assert.doesNotMatch(html, /id="sidebar"/);
  assert.doesNotMatch(html, /sidebar-toggle/);
  assert.match(html, /MediCare/);
});

test('admin preview renders hamburger, role menu, active link and footer', async () => {
  config.devPreviewRole = 'admin';
  const { html } = await get('/');
  assert.match(html, /id="sidebar-toggle"/);
  assert.match(html, /Médecins/);
  assert.match(html, /class="nav-link is-active" href="\/" aria-current="page"|href="\/" class="nav-link is-active"/);
  assert.match(html, /Administrateur/);
  assert.match(html, /Version 0\.1\.0/);
});

test('patient preview shows patient menu only', async () => {
  config.devPreviewRole = 'patient';
  const { html } = await get('/');
  assert.match(html, /Prendre rendez-vous/);
  assert.doesNotMatch(html, /Spécialités/);
});

test('preview role is ignored in production', async () => {
  config.devPreviewRole = 'admin';
  config.nodeEnv = 'production';
  const { html } = await get('/');
  config.nodeEnv = 'test';
  config.devPreviewRole = '';
  assert.doesNotMatch(html, /id="sidebar"/);
});
