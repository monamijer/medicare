const db = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const Appointment = require('../src/models/Appointment');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const Slot = require('../src/models/AvailabilitySlot');
const Specialty = require('../src/models/Specialty');
const User = require('../src/models/User');
const { createUser } = require('./helpers/fixtures');
const { api, apiLogin } = require('./helpers/api');
const clinicHelpers = require('./helpers/clinic');

const { newClient, closeAll, makeDoctor, makePatient, makeSlot } = clinicHelpers(app);
let cardio;
let derm;
let admin;

test.before(async () => {
  await db.connect();
  await Promise.all([User.init(), Doctor.init(), Patient.init(), Slot.init(), Appointment.init(), Specialty.init()]);
});
test.beforeEach(async () => {
  await db.clear();
  [cardio, derm] = await Promise.all([Specialty.create({ name: 'Cardiologie' }), Specialty.create({ name: 'Dermatologie' })]);
  await createUser('admin');
  admin = newClient();
  await apiLogin(admin, 'admin@clinique.test');
});
test.afterEach(closeAll);
test.after(db.close);

const patientClient = async () => {
  await createUser('patient');
  const client = newClient();
  await apiLogin(client, 'patient@clinique.test');
  return client;
};
const newDoctor = (over = {}) => ({
  firstName: 'Awa', lastName: 'Ndayi', email: 'awa@clinique.test', password: 'motdepasse1',
  specialty: String(cardio.id), licenseNumber: 'BI-1001', phone: '+257 79 00 00 00', ...over,
});

test('every catalog endpoint needs a login; only admins may write', async () => {
  const anonymous = newClient();
  for (const path of ['/specialties', '/doctors', `/doctors/${cardio.id}`]) assert.strictEqual((await api(anonymous, 'GET', path)).status, 401, path);
  const patient = await patientClient();
  for (const [method, path] of [['POST', '/specialties'], ['PUT', `/specialties/${cardio.id}`], ['DELETE', `/specialties/${cardio.id}`], ['POST', '/doctors'], ['PUT', `/doctors/${cardio.id}`], ['DELETE', `/doctors/${cardio.id}`], ['POST', `/doctors/${cardio.id}/reactivate`]]) {
    const payload = ['POST', 'PUT'].includes(method) ? { name: 'x' } : undefined;
    assert.strictEqual((await api(patient, method, path, payload)).status, 403, `${method} ${path}`);
  }
  assert.strictEqual((await api(patient, 'GET', '/specialties')).status, 200);
});

test('specialties: list, create, rename, delete, with validation and conflicts', async () => {
  const list = await api(admin, 'GET', '/specialties');
  assert.deepStrictEqual(list.json.specialties.map((s) => s.name), ['Cardiologie', 'Dermatologie']);
  assert.deepStrictEqual(Object.keys(list.json.specialties[0]).sort(), ['id', 'name']);

  const created = await api(admin, 'POST', '/specialties', { name: ' Pédiatrie ' });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.json.specialty.name, 'Pédiatrie');
  const { id } = created.json.specialty;

  const dup = await api(admin, 'POST', '/specialties', { name: 'pediatrie' });
  assert.strictEqual(dup.status, 409);
  assert.match(dup.json.error.fields.name, /existe déjà/);
  const bad = await api(admin, 'POST', '/specialties', { name: 'A' });
  assert.strictEqual(bad.status, 422);
  assert.match(bad.json.error.fields.name, /entre 2 et 80/);

  const renamed = await api(admin, 'PUT', `/specialties/${id}`, { name: 'Pédiatrie générale' });
  assert.strictEqual(renamed.status, 200);
  assert.strictEqual((await api(admin, 'GET', `/specialties/${id}`)).json.specialty.name, 'Pédiatrie générale');
  assert.strictEqual((await api(admin, 'PUT', `/specialties/${cardio.id}`, { name: 'dermatologie' })).status, 409);

  const removed = await api(admin, 'DELETE', `/specialties/${id}`);
  assert.strictEqual(removed.status, 204);
  assert.strictEqual((await api(admin, 'GET', `/specialties/${id}`)).status, 404);
  assert.strictEqual((await api(admin, 'GET', '/specialties/not-an-id')).status, 404);
});

test('a specialty used by a doctor cannot be deleted', async () => {
  await makeDoctor('Abel', cardio);
  const res = await api(admin, 'DELETE', `/specialties/${cardio.id}`);
  assert.strictEqual(res.status, 409);
  assert.match(res.json.error.message, /utilisée par au moins un médecin/);
  assert.strictEqual(await Specialty.countDocuments({ _id: cardio.id }), 1);
});

test('admin creates, reads, updates a doctor; the password never comes back', async () => {
  const created = await api(admin, 'POST', '/doctors', newDoctor());
  assert.strictEqual(created.status, 201);
  const doctor = created.json.doctor;
  assert.deepStrictEqual(doctor, {
    id: doctor.id, firstName: 'Awa', lastName: 'Ndayi', fullName: 'Awa Ndayi', specialty: { id: String(cardio.id), name: 'Cardiologie' },
    email: 'awa@clinique.test', phone: '+257 79 00 00 00', licenseNumber: 'BI-1001', active: true,
  });
  assert.doesNotMatch(created.html, /motdepasse1|passwordHash|\$2[aby]\$/);

  const updated = await api(admin, 'PUT', `/doctors/${doctor.id}`, newDoctor({ firstName: 'Awa-Marie', specialty: String(derm.id), password: '' }));
  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.json.doctor.firstName, 'Awa-Marie');
  assert.strictEqual(updated.json.doctor.specialty.name, 'Dermatologie');
  assert.strictEqual((await api(admin, 'GET', `/doctors/${doctor.id}`)).json.doctor.licenseNumber, 'BI-1001');
  const login = await apiLogin(newClient(), 'awa@clinique.test'); // the doctor can sign in with the chosen password
  assert.strictEqual(login.json.user.role, 'doctor');
});

test('unknown or malformed doctor ids give 404 on every verb', async () => {
  for (const id of ['64b7f0c2a1b2c3d4e5f60718', 'bad']) {
    assert.strictEqual((await api(admin, 'GET', `/doctors/${id}`)).status, 404);
    assert.strictEqual((await api(admin, 'PUT', `/doctors/${id}`, newDoctor())).status, 404);
    assert.strictEqual((await api(admin, 'DELETE', `/doctors/${id}`)).status, 404);
    assert.strictEqual((await api(admin, 'POST', `/doctors/${id}/reactivate`)).status, 404);
  }
});

test('doctor validation and conflicts come back per field', async () => {
  const bad = await api(admin, 'POST', '/doctors', newDoctor({ firstName: 'A', email: 'x', specialty: 'x', licenseNumber: 'x', phone: 'abc', password: 'court' }));
  assert.strictEqual(bad.status, 422);
  for (const field of ['firstName', 'email', 'specialty', 'licenseNumber', 'phone', 'password']) assert.ok(bad.json.error.fields[field], field);
  assert.strictEqual(await Doctor.countDocuments(), 0);

  await api(admin, 'POST', '/doctors', newDoctor());
  const sameEmail = await api(admin, 'POST', '/doctors', newDoctor({ licenseNumber: 'BI-9' }));
  assert.strictEqual(sameEmail.status, 409);
  assert.ok(sameEmail.json.error.fields.email);
  const sameLicense = await api(admin, 'POST', '/doctors', newDoctor({ email: 'autre@clinique.test' }));
  assert.strictEqual(sameLicense.status, 409);
  assert.ok(sameLicense.json.error.fields.licenseNumber);
  const unknownSpecialty = await api(admin, 'POST', '/doctors', newDoctor({ email: 'z@clinique.test', licenseNumber: 'BI-2', specialty: '64b7f0c2a1b2c3d4e5f60718' }));
  assert.strictEqual(unknownSpecialty.status, 422);
  assert.strictEqual(await Doctor.countDocuments(), 1);
});

test('patients get a public view of doctors, filtered by specialty; admins see everything', async () => {
  await makeDoctor('Abel', cardio);
  await makeDoctor('Peau', derm);
  const patient = await patientClient();

  const publicList = await api(patient, 'GET', `/doctors?specialty=${cardio.id}`);
  assert.strictEqual(publicList.status, 200);
  assert.strictEqual(publicList.json.doctors.length, 1);
  assert.deepStrictEqual(Object.keys(publicList.json.doctors[0]).sort(), ['firstName', 'fullName', 'id', 'lastName', 'specialty']);
  assert.doesNotMatch(publicList.html, /abel@clinique\.test|L-Abel/);

  assert.strictEqual((await api(patient, 'GET', '/doctors')).json.doctors.length, 2);
  const adminList = await api(admin, 'GET', '/doctors');
  assert.strictEqual(adminList.json.doctors.length, 2);
  assert.ok(adminList.json.doctors.every((d) => d.email && d.licenseNumber && d.active === true));

  const bad = await api(patient, 'GET', '/doctors?specialty=nimporte');
  assert.strictEqual(bad.status, 422);
  assert.ok(bad.json.error.fields.specialty);
});

test('deactivated doctors are invisible to patients but visible to admins', async () => {
  const abel = await makeDoctor('Abel', cardio);
  await User.updateOne({ email: 'abel@clinique.test' }, { active: false });
  const patient = await patientClient();
  assert.strictEqual((await api(patient, 'GET', '/doctors')).json.doctors.length, 0);
  assert.strictEqual((await api(patient, 'GET', `/doctors/${abel.id}`)).status, 404);
  assert.strictEqual((await api(patient, 'GET', `/doctors/${abel.id}/slots`)).status, 404);
  const seen = await api(admin, 'GET', `/doctors/${abel.id}`);
  assert.strictEqual(seen.status, 200);
  assert.strictEqual(seen.json.doctor.active, false);
});

test('deleting a doctor: deleted, refused while appointments are upcoming, deactivated with history, then reactivated', async () => {
  const lonely = await makeDoctor('Seul', cardio);
  const removed = await api(admin, 'DELETE', `/doctors/${lonely.id}`);
  assert.deepStrictEqual(removed.json, { result: 'deleted' });
  assert.strictEqual((await api(admin, 'GET', `/doctors/${lonely.id}`)).status, 404);

  const abel = await makeDoctor('Abel', cardio);
  const slot = await makeSlot(abel, 48);
  const jean = await makePatient('Jean');
  await jean.client.request('/appointments', { method: 'POST', form: { slot: String(slot.id) } });
  const refused = await api(admin, 'DELETE', `/doctors/${abel.id}`);
  assert.strictEqual(refused.status, 409);
  assert.match(refused.json.error.message, /1 rendez-vous à venir/);

  const appointment = await Appointment.findOne();
  await jean.client.request(`/appointments/${appointment.id}/cancel`, { method: 'POST' });
  const kept = await api(admin, 'DELETE', `/doctors/${abel.id}`);
  assert.deepStrictEqual(kept.json, { result: 'deactivated' });
  assert.strictEqual((await api(admin, 'GET', `/doctors/${abel.id}`)).json.doctor.active, false);

  const back = await api(admin, 'POST', `/doctors/${abel.id}/reactivate`);
  assert.strictEqual(back.status, 200);
  assert.strictEqual(back.json.doctor.active, true);
  assert.strictEqual((await api(admin, 'POST', '/doctors/bad/reactivate')).status, 404);
});

test('a doctor\'s free slots: only upcoming free ones, with the clinic timezone', async () => {
  const abel = await makeDoctor('Abel', cardio);
  const free = await makeSlot(abel, 48);
  await makeSlot(abel, 50, 30, 'booked');
  await makeSlot(abel, -5);
  const patient = await patientClient();
  const res = await api(patient, 'GET', `/doctors/${abel.id}/slots`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.timezone, 'Africa/Bujumbura');
  assert.strictEqual(res.json.slots.length, 1);
  assert.deepStrictEqual(res.json.slots[0], { id: String(free.id), start: free.start.toISOString(), end: free.end.toISOString() });
  assert.strictEqual((await api(patient, 'GET', '/doctors/bad/slots')).status, 404);
});
