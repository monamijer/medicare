// JSON API helpers for tests.
const { PASSWORD } = require('./fixtures');

const api = (client, method, path, json) => client.request(`/api/v1${path}`, { method, json });

async function apiLogin(client, email, password = PASSWORD) {
  const res = await api(client, 'POST', '/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`API login failed for ${email}: ${res.status}`);
  return res;
}

module.exports = { api, apiLogin };
