const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const Appointment = require('../src/models/Appointment');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const Slot = require('../src/models/AvailabilitySlot');
const User = require('../src/models/User');
const { zonedToUtc, addDays, today } = require('../src/utils/time');
const { createUser } = require('./helpers/fixtures');
const clinicHelpers = require('./helpers/clinic');

const { newClient, closeAll, makeSpecialties, makeDoctor, makePatient, loginStaff } = clinicHelpers(app);
let cardio;

test.before(async () => {
  await db.connect();
  await Promise.all([User.init(), Doctor.init(), Patient.init(), Slot.init(), Appointment.init()]);
});
test.beforeEach(async () => {
  await db.clear();
  [cardio] = await makeSpecialties();
});
test.afterEach(closeAll);
test.after(db.close);

// Creates a booked slot + appointment at a clinic-local date/time, whatever "now" is.
async function appointmentAt(doctor, patient, date, time, { reason = '', status = 'confirmed', minutes = 30 } = {}) {
  const start = zonedToUtc(date, time);
  const end = new Date(start.getTime() + minutes * 60000);
  const slot = await Slot.create({ doctor: doctor.id, start, end, status: 'booked' });
  return Appointment.create({ slot: slot.id, doctor: doctor.id, patient: patient.id, start, end, reason, status });
}

const dayPage = (client, date) => client.request(`/appointments/day${date ? `?date=${date}` : ''}`);
const DAY = addDays(today(), 5);

test('patients get 403, anonymous users are redirected to login', async () => {
  const { client } = await makePatient('Jean');
  assert.strictEqual((await dayPage(client, DAY)).status, 403);
  const res = await dayPage(newClient(), DAY);
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/login');
});

test('a doctor sees only their own confirmed appointments of that day, in time order', async () => {
  const abel = await makeDoctor('Abel', cardio);
  const zola = await makeDoctor('Zola', cardio);
  const jean = await makePatient('Jean');
  const marie = await makePatient('Marie');
  await appointmentAt(abel, marie.patient, DAY, '14:00', { reason: 'Contrôle' });
  await appointmentAt(abel, jean.patient, DAY, '09:00', { reason: 'Douleurs' });
  await appointmentAt(zola, jean.patient, DAY, '10:00');                              // other doctor
  await appointmentAt(abel, jean.patient, addDays(DAY, 1), '09:00');                  // other day
  await appointmentAt(abel, marie.patient, DAY, '11:00', { status: 'cancelled' });    // cancelled

  const { html, status } = await dayPage(await loginStaff('abel'), DAY);
  assert.strictEqual(status, 200);
  assert.match(html, /2 rendez-vous/);
  assert.match(html, /09:00 – 09:30/);
  assert.match(html, /14:00 – 14:30/);
  assert.ok(html.indexOf('Pat Jean') < html.indexOf('Pat Marie'));
  assert.match(html, /Douleurs/);
  assert.doesNotMatch(html, /10:00 – 10:30/);
  assert.doesNotMatch(html, /11:00 – 11:30/);
  assert.doesNotMatch(html, /Médecin<\/th>/);
});

test('days are cut at midnight clinic time, not UTC', async () => {
  const abel = await makeDoctor('Abel', cardio);
  const jean = await makePatient('Jean');
  await appointmentAt(abel, jean.patient, DAY, '23:30');
  await appointmentAt(abel, jean.patient, addDays(DAY, 1), '00:15');
  const doctor = await loginStaff('abel');
  const first = (await dayPage(doctor, DAY)).html;
  const second = (await dayPage(doctor, addDays(DAY, 1))).html;
  assert.match(first, /23:30 – 00:00/);
  assert.doesNotMatch(first, /00:15/);
  assert.match(second, /00:15 – 00:45/);
  assert.doesNotMatch(second, /23:30/);
});

test('an admin sees every doctor\'s appointments with a doctor column', async () => {
  const abel = await makeDoctor('Abel', cardio);
  const zola = await makeDoctor('Zola', cardio);
  const jean = await makePatient('Jean');
  await appointmentAt(abel, jean.patient, DAY, '09:00');
  await appointmentAt(zola, jean.patient, DAY, '10:00');
  await createUser('admin');
  const { html } = await dayPage(await loginStaff('admin'), DAY);
  assert.match(html, /2 rendez-vous/);
  assert.match(html, /Médecin<\/th>/);
  assert.match(html, /Dr Abel/);
  assert.match(html, /Dr Zola/);
});

test('without a date it shows today, with working previous/next links', async () => {
  const abel = await makeDoctor('Abel', cardio);
  const jean = await makePatient('Jean');
  await appointmentAt(abel, jean.patient, today(), '12:00', { reason: 'Aujourd hui' });
  const doctor = await loginStaff('abel');

  const now = (await dayPage(doctor)).html;
  assert.match(now, /Aujourd hui/);
  assert.match(now, new RegExp(`date=${addDays(today(), -1)}`));
  assert.match(now, new RegExp(`date=${addDays(today(), 1)}`));
  assert.match(now, /is-disabled[^>]*>Aujourd'hui|Aujourd'hui<\/span>/);

  const other = (await dayPage(doctor, DAY)).html;
  assert.match(other, /href="\/appointments\/day">Aujourd'hui/);
  assert.doesNotMatch(other, /Aujourd hui/);
  assert.match((await dayPage(doctor, '')).html, /Aujourd hui/); // an emptied date field means today
});

test('an invalid date redirects to today with a message', async () => {
  const doctor = await (async () => { await makeDoctor('Abel', cardio); return loginStaff('abel'); })();
  for (const bad of ['2027-02-31', 'demain', '1', '2027-13-01']) {
    const res = await dayPage(doctor, bad);
    assert.strictEqual(res.status, 302, bad);
    assert.strictEqual(res.location, '/appointments/day');
  }
  assert.match((await doctor.request('/appointments/day')).html, /Date invalide|Aucun rendez-vous/);
  const array = await doctor.request('/appointments/day?date=a&date=b');
  assert.strictEqual(array.status, 302);
});

test('an empty day shows an empty state; reasons are escaped; the menu entry is the active one', async () => {
  const abel = await makeDoctor('Abel', cardio);
  const jean = await makePatient('Jean');
  const doctor = await loginStaff('abel');
  const empty = await dayPage(doctor, DAY);
  assert.match(empty.html, /Aucun rendez-vous confirmé n'est prévu/);
  assert.strictEqual((empty.html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(empty.html, /aria-current="page"[^>]*>[\s\S]*?Agenda du jour/);

  await appointmentAt(abel, jean.patient, DAY, '09:00', { reason: '<script>alert(1)</script>' });
  const { html } = await dayPage(doctor, DAY);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)/);
});

test('"Agenda du jour" is in the doctor and admin menus but not the patient menu', async () => {
  await makeDoctor('Abel', cardio);
  await createUser('admin');
  const { client } = await makePatient('Jean');
  assert.match((await (await loginStaff('abel')).request('/')).html, /Agenda du jour/);
  assert.match((await (await loginStaff('admin')).request('/')).html, /Agenda du jour/);
  assert.doesNotMatch((await client.request('/')).html, /Agenda du jour/);
});
