// Clinic-local time helpers. The database stores UTC; people type and read clinic time.
const config = require('../config/env');

const pad = (n) => String(n).padStart(2, '0');
const zone = (tz) => tz || config.clinicTimezone;

function partsIn(instant, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone(tz), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

function offsetMs(instant, tz) {
  const p = partsIn(instant, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant.getTime() / 1000) * 1000;
}

function toLocalParts(instant, tz) {
  const p = partsIn(instant, tz);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

// 'YYYY-MM-DD' + 'HH:mm' in the clinic zone -> UTC Date, or null if it does not exist.
function zonedToUtc(date, time, tz) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time || '');
  if (!d || !t) return null;
  const wall = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  let utc = wall - offsetMs(new Date(wall), tz);
  utc = wall - offsetMs(new Date(utc), tz); // second pass handles daylight-saving boundaries
  const result = new Date(utc);
  const back = toLocalParts(result, tz);
  return back.date === date && back.time === time ? result : null; // rejects 2027-02-31 or a skipped hour
}

const formatTime = (instant, tz) => toLocalParts(instant, tz).time;
const dayKey = (instant, tz) => toLocalParts(instant, tz).date;

function formatDay(instant, tz) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: zone(tz), weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(instant);
}

module.exports = { zonedToUtc, toLocalParts, formatTime, formatDay, dayKey };
