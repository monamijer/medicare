const test = require('node:test');
const assert = require('node:assert');

test('connectDatabase gives a clear error when MongoDB is unreachable', async () => {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/medicare_unreachable';
  const { connectDatabase } = require('../src/config/database');
  await assert.rejects(connectDatabase(), /Impossible de se connecter à MongoDB/);
  await require('mongoose').disconnect();
});
