const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const rounds = (value) => Number(execFileSync(process.execPath, ['-p', "require('./src/config/env').bcryptRounds"], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, BCRYPT_ROUNDS: value },
  encoding: 'utf8',
}).trim());

test('password hashing defaults to work factor 10 outside the test suite', () => {
  assert.strictEqual(rounds(''), 10);
  assert.strictEqual(rounds('not-a-number'), 10);
});

test('the work factor can be changed through BCRYPT_ROUNDS', () => {
  assert.strictEqual(rounds('12'), 12);
});
