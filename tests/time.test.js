require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { zonedToUtc, toLocalParts, formatTime, formatDay, dayKey, addDays, today, dayRange } = require('../src/utils/time');

test('clinic time (Africa/Bujumbura, UTC+2) converts to UTC and back', () => {
  const utc = zonedToUtc('2027-03-10', '09:00', 'Africa/Bujumbura');
  assert.strictEqual(utc.toISOString(), '2027-03-10T07:00:00.000Z');
  assert.deepStrictEqual(toLocalParts(utc, 'Africa/Bujumbura'), { date: '2027-03-10', time: '09:00' });
  assert.strictEqual(formatTime(utc, 'Africa/Bujumbura'), '09:00');
});

test('conversion follows daylight saving time in other zones', () => {
  assert.strictEqual(zonedToUtc('2027-07-01', '09:00', 'Europe/Paris').toISOString(), '2027-07-01T07:00:00.000Z');
  assert.strictEqual(zonedToUtc('2027-01-15', '09:00', 'Europe/Paris').toISOString(), '2027-01-15T08:00:00.000Z');
});

test('impossible dates, times and skipped hours are rejected', () => {
  assert.strictEqual(zonedToUtc('2027-02-31', '09:00', 'Africa/Bujumbura'), null);
  assert.strictEqual(zonedToUtc('2027-02-10', '24:00', 'Africa/Bujumbura'), null);
  assert.strictEqual(zonedToUtc('2027-02-10', '9:00', 'Africa/Bujumbura'), null);
  assert.strictEqual(zonedToUtc('', '09:00', 'Africa/Bujumbura'), null);
  assert.strictEqual(zonedToUtc('2027-03-28', '02:30', 'Europe/Paris'), null); // clocks jump 02:00 -> 03:00
});

test('late evening local time lands on the right local day', () => {
  const utc = zonedToUtc('2027-03-10', '23:30', 'Africa/Bujumbura');
  assert.strictEqual(utc.toISOString(), '2027-03-10T21:30:00.000Z');
  assert.strictEqual(dayKey(utc, 'Africa/Bujumbura'), '2027-03-10');
  assert.strictEqual(dayKey(new Date('2027-03-10T23:30:00Z'), 'Africa/Bujumbura'), '2027-03-11');
});

test('days are formatted in French', () => {
  assert.strictEqual(formatDay(new Date('2027-03-10T07:00:00Z'), 'Africa/Bujumbura'), 'mercredi 10 mars 2027');
});

test('addDays crosses month and year boundaries and leap days', () => {
  assert.strictEqual(addDays('2027-01-31', 1), '2027-02-01');
  assert.strictEqual(addDays('2027-12-31', 1), '2028-01-01');
  assert.strictEqual(addDays('2028-02-28', 1), '2028-02-29');
  assert.strictEqual(addDays('2027-03-01', -1), '2027-02-28');
});

test('dayRange covers exactly one clinic-local day', () => {
  const range = dayRange('2027-03-10', 'Africa/Bujumbura');
  assert.strictEqual(range.start.toISOString(), '2027-03-09T22:00:00.000Z');
  assert.strictEqual(range.end.toISOString(), '2027-03-10T22:00:00.000Z');
  assert.strictEqual(dayRange('2027-02-31', 'Africa/Bujumbura'), null);
  const spring = dayRange('2027-03-28', 'Europe/Paris'); // a 23-hour day
  assert.strictEqual((spring.end - spring.start) / 3600000, 23);
});

test('today() is a valid local date', () => {
  assert.match(today('Africa/Bujumbura'), /^\d{4}-\d{2}-\d{2}$/);
});
