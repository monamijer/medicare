const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');

test('GET /api/v1/health returns ok', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
  const body = await res.json();
  server.close();
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(body, { status: 'ok' });
});

test('GET / renders the French home page', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/`);
  const html = await res.text();
  server.close();
  assert.strictEqual(res.status, 200);
  assert.match(html, /lang="fr"/);
  assert.match(html, /MediCare/);
});

test('unknown web page renders a 404 error page', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/nope`);
  const html = await res.text();
  server.close();
  assert.strictEqual(res.status, 404);
  assert.match(html, /Erreur 404/);
});

test('unknown API route returns JSON 404', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/v1/nope`);
  const body = await res.json();
  server.close();
  assert.strictEqual(res.status, 404);
  assert.strictEqual(body.error.status, 404);
});
