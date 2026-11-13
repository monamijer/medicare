const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const Appointment = require('../src/models/Appointment');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const Slot = require('../src/models/AvailabilitySlot');
const User = require('../src/models/User');
const { createUser } = require('./helpers/fixtures');
const clinicHelpers = require('./helpers/clinic');

const { formatTime } = require('../src/utils/time');
const { closeAll, consistency, makeSpecialties, makeDoctor, makePatient, makeSlot, book, loginStaff } = clinicHelpers(app);
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

const move = (client, appointment, slot, reason = '') => client.request(`/appointments/${appointment.id}`, {
  method: 'POST', form: { slot: String(slot.id || slot), reason },
});
const cancel = (client, appointment) => client.request(`/appointments/${appointment.id}/cancel`, { method: 'POST' });
const status = async (slot) => (await Slot.findById(slot.id)).status;

// Dr Abel with three slots (+48h, +50h, +52h); Jean holds the first one.
async function setup() {
  const doctor = await makeDoctor('Abel', cardio);
  const [s1, s2, s3] = [await makeSlot(doctor, 48), await makeSlot(doctor, 50), await makeSlot(doctor, 52)];
  const jean = await makePatient('Jean');
  await book(jean.client, s1, 'Premier motif');
  const appointment = await Appointment.findOne();
  return { doctor, s1, s2, s3, jean, appointment };
}

test('the edit page offers the current slot and the doctor\'s other free slots only', async () => {
  const { doctor, jean, appointment, s1, s2, s3 } = await setup();
  await Slot.updateOne({ _id: s3.id }, { status: 'booked' });
  const other = await makeDoctor('Zola', cardio);
  const foreign = await makeSlot(other, 60);
  const past = await makeSlot(doctor, -5);

  const page = await jean.client.request(`/appointments/${appointment.id}/edit`);
  assert.strictEqual(page.status, 200);
  assert.match(page.html, /Créneau actuel/);
  assert.match(page.html, new RegExp(`value="${s1.id}" checked`));
  assert.match(page.html, new RegExp(`value="${s2.id}"`));
  for (const hidden of [s3, foreign, past]) assert.doesNotMatch(page.html, new RegExp(`value="${hidden.id}"`));
  assert.match(page.html, /Premier motif/);
  assert.match((await jean.client.request('/appointments')).html, /Modifier/);
});

test('moving to another slot switches the booking and frees the old slot', async () => {
  const { s1, s2, jean, appointment } = await setup();
  const res = await move(jean.client, appointment, s2, 'Nouveau motif');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/appointments');

  const saved = await Appointment.findById(appointment.id);
  assert.strictEqual(String(saved.slot), s2.id);
  assert.strictEqual(saved.start.getTime(), s2.start.getTime());
  assert.strictEqual(saved.end.getTime(), s2.end.getTime());
  assert.strictEqual(saved.reason, 'Nouveau motif');
  assert.strictEqual(saved.status, 'confirmed');
  assert.strictEqual(await status(s1), 'free');
  assert.strictEqual(await status(s2), 'booked');
  const after = (await jean.client.request('/appointments')).html;
  assert.match(after, /Rendez-vous modifié/);
  assert.match(after, new RegExp(`Rendez-vous modifié : [^<]* à ${formatTime(s2.start)}`)); // the NEW time, not the old one
  assert.strictEqual((await consistency()).timesMatch, true);

  const marie = await makePatient('Marie');
  assert.strictEqual((await book(marie.client, s1)).location, '/appointments'); // old slot is bookable again
});

test('keeping the same slot only changes the reason', async () => {
  const { s1, jean, appointment } = await setup();
  assert.strictEqual((await move(jean.client, appointment, s1, 'Autre motif')).status, 302);
  const saved = await Appointment.findById(appointment.id);
  assert.strictEqual(saved.reason, 'Autre motif');
  assert.strictEqual(String(saved.slot), s1.id);
  assert.strictEqual(await status(s1), 'booked');
});

test('a slot taken in the meantime is refused and nothing changes', async () => {
  const { s1, s2, jean, appointment } = await setup();
  const marie = await makePatient('Marie');
  await book(marie.client, s2);
  const res = await move(jean.client, appointment, s2);
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, `/appointments/${appointment.id}/edit`);
  assert.match((await jean.client.request(res.location)).html, /plus disponible/);
  assert.strictEqual(String((await Appointment.findById(appointment.id)).slot), s1.id);
  assert.strictEqual(await status(s1), 'booked');
});

test('past slots, other doctors\' slots and bad ids are refused', async () => {
  const { doctor, jean, appointment, s1 } = await setup();
  const other = await makeDoctor('Zola', cardio);
  const foreign = await makeSlot(other, 60);
  const past = await makeSlot(doctor, -5);
  for (const slot of [foreign, past]) {
    const res = await move(jean.client, appointment, slot);
    assert.strictEqual(res.status, 302);
  }
  assert.strictEqual(await status(foreign), 'free');
  assert.strictEqual(await status(past), 'free');
  assert.strictEqual((await move(jean.client, appointment, '64b7f0c2a1b2c3d4e5f60718')).status, 302);
  assert.strictEqual(String((await Appointment.findById(appointment.id)).slot), s1.id);
  assert.match((await jean.client.request(`/appointments/${appointment.id}/edit`)).html, /même médecin|plus disponible|introuvable/);
});

test('a patient cannot move onto a time where they already have another appointment', async () => {
  const { doctor, jean, appointment, s2 } = await setup();
  const dermatologist = await makeDoctor('Peau', cardio);
  const clash = await makeSlot(dermatologist, 50); // same time as s2
  await book(jean.client, clash);
  const res = await move(jean.client, appointment, s2);
  assert.strictEqual(res.status, 302);
  assert.match((await jean.client.request(`/appointments/${appointment.id}/edit`)).html, /déjà un rendez-vous à cette heure/);
  assert.strictEqual(await status(s2), 'free');
  assert.ok(doctor);
});

test('two moves of one appointment to different slots leave a consistent state', async () => {
  const { s2, s3, jean, appointment } = await setup();
  await Promise.all([move(jean.client, appointment, s2), move(jean.client, appointment, s3), move(jean.client, appointment, s2)]);
  const saved = await Appointment.findById(appointment.id);
  assert.strictEqual(saved.status, 'confirmed');
  assert.ok([s2.id, s3.id].includes(String(saved.slot)));
  assert.strictEqual(await Slot.countDocuments({ status: 'booked' }), 1);
  assert.strictEqual((await Slot.findById(saved.slot)).status, 'booked');
  const state = await consistency();
  assert.deepStrictEqual(state.bookedSlots, state.confirmedSlots);
  assert.strictEqual(state.timesMatch, true);
});

test('two patients moving into the same free slot: one wins, the other keeps their booking', async () => {
  const doctor = await makeDoctor('Abel', cardio);
  const [a, b, target] = [await makeSlot(doctor, 48), await makeSlot(doctor, 49), await makeSlot(doctor, 60)];
  const jean = await makePatient('Jean');
  const marie = await makePatient('Marie');
  await book(jean.client, a);
  await book(marie.client, b);
  const [jeanAppt, marieAppt] = [await Appointment.findOne({ slot: a.id }), await Appointment.findOne({ slot: b.id })];

  await Promise.all([move(jean.client, jeanAppt, target), move(marie.client, marieAppt, target)]);

  const moved = await Appointment.find({ slot: target.id, status: 'confirmed' });
  assert.strictEqual(moved.length, 1);
  assert.strictEqual(await Appointment.countDocuments({ status: 'confirmed' }), 2);
  assert.strictEqual(await Slot.countDocuments({ status: 'booked' }), 2); // one slot per appointment, no leak
  for (const appt of await Appointment.find({ status: 'confirmed' })) assert.strictEqual((await Slot.findById(appt.slot)).status, 'booked');
});

test('moving and cancelling at the same moment never leaves a leaked or double-booked slot', async () => {
  for (let i = 0; i < 8; i += 1) {
    await db.clear();
    [cardio] = await makeSpecialties();
    const doctor = await makeDoctor('Abel', cardio);
    const [s1, s2] = [await makeSlot(doctor, 48), await makeSlot(doctor, 50)];
    const jean = await makePatient('Jean');
    await book(jean.client, s1);
    const appointment = await Appointment.findOne();
    await Promise.all([move(jean.client, appointment, s2), cancel(jean.client, appointment)]);

    const state = await consistency();
    assert.deepStrictEqual(state.bookedSlots, state.confirmedSlots, `iteration ${i}`);
    assert.strictEqual(state.timesMatch, true, `iteration ${i}`);
    closeAll();
  }
});

test('doctors cannot move appointments, other patients get 404, admins can', async () => {
  const { appointment, s2, s1 } = await setup();
  const doctor = await loginStaff('abel');
  assert.strictEqual((await doctor.request(`/appointments/${appointment.id}/edit`)).status, 403);
  assert.strictEqual((await move(doctor, appointment, s2)).status, 403);

  const marie = await makePatient('Marie');
  assert.strictEqual((await marie.client.request(`/appointments/${appointment.id}/edit`)).status, 404);
  assert.strictEqual((await move(marie.client, appointment, s2)).status, 404);
  assert.strictEqual(String((await Appointment.findById(appointment.id)).slot), s1.id);

  await createUser('admin');
  const admin = await loginStaff('admin');
  const page = await admin.request(`/appointments/${appointment.id}/edit`);
  assert.match(page.html, /Pat Jean/);
  assert.strictEqual((await move(admin, appointment, s2)).status, 302);
  assert.strictEqual(String((await Appointment.findById(appointment.id)).slot), s2.id);
});

test('cancelled and past appointments cannot be modified', async () => {
  const { jean, appointment, s2, doctor } = await setup();
  await cancel(jean.client, appointment);
  const edit = await jean.client.request(`/appointments/${appointment.id}/edit`);
  assert.strictEqual(edit.status, 302);
  assert.match((await jean.client.request('/appointments')).html, /annulé : il ne peut plus être modifié/);
  assert.strictEqual((await move(jean.client, appointment, s2)).status, 302);
  assert.strictEqual(await status(s2), 'free');

  const pastSlot = await makeSlot(doctor, -5, 30, 'booked');
  const patient = await Patient.findOne();
  const past = await Appointment.create({ slot: pastSlot.id, doctor: doctor.id, patient: patient.id, start: pastSlot.start, end: pastSlot.end });
  assert.strictEqual((await jean.client.request(`/appointments/${past.id}/edit`)).status, 302);
  assert.match((await jean.client.request('/appointments')).html, /est passé : il ne peut plus être modifié/);
});

test('a too long reason is refused; unknown ids give 404; anonymous users go to login', async () => {
  const { jean, appointment, s2 } = await setup();
  const long = await move(jean.client, appointment, s2, 'x'.repeat(301));
  assert.strictEqual(long.status, 422);
  assert.match(long.html, /300 caractères/);
  assert.strictEqual(await status(s2), 'free');
  for (const id of ['64b7f0c2a1b2c3d4e5f60718', 'bad']) {
    assert.strictEqual((await jean.client.request(`/appointments/${id}/edit`)).status, 404);
    assert.strictEqual((await jean.client.request(`/appointments/${id}`, { method: 'POST', form: { slot: s2.id } })).status, 404);
  }
  const anon = clinicHelpers(app);
  const res = await anon.newClient().request(`/appointments/${appointment.id}/edit`);
  anon.closeAll();
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.location, '/login');
});
