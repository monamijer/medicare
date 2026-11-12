const userService = require('../../src/services/userService');

const PASSWORD = 'motdepasse1';

async function createUser(role = 'admin', overrides = {}) {
  return userService.createUser({
    email: `${role}@clinique.test`,
    password: PASSWORD,
    role,
    firstName: 'Test',
    lastName: role,
    ...overrides,
  });
}

async function loginAs(client, email, password = PASSWORD) {
  return client.request('/login', { method: 'POST', form: { email, password } });
}

module.exports = { PASSWORD, createUser, loginAs };
