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
let admin;

test.before(async () => {
  await db.connect();
  await Promise.all([User.init(), Doctor.init(), Patient.init(), Slot.init(), Appointment.init(), Specialty.init()]);
});
test.beforeEach(async () => {
  await db.clear();
  cardio = await Specialty.create({ name: 'Cardiologie' });
  await createUser('admin');
  admin = newClient();
  await apiLogin(admin, 'admin@clinique.test');
});
test.afterEach(closeAll);
test.after(db.close);

const body = (over = {}) => ({
  firstName: 'Jean', lastName: 'Bizimana', email: 'jean@exemple.test', password: 'motdepasse1', birthDate: '1990-05-17', phone: '+257 79 11 22 33', ...over,
});
const ownClient = async (name = 'Jean') => {
  const { client, patient } = await makePatient(name);
  const api2 = newClient();
  await apiLogin(api2, `${name.toLowerCase()}@exemple.test`);
  return { client: api2, patient, webClient: client };
};

test('only admins reach the patient list; patients and doctors get 403; anonymous gets 401', async () => {
  const { client } = await ownClient();
  await createUser('doctor');
  const doctor = newClient();
  await apiLogin(doctor, 'doctor@clinique.test');
  const someId = '64b7f0c2a1b2c3d4e5f60718';
  for (const who of [client, doctor]) {
    for (const [method, path] of [['GET', '/patients'], ['GET', `/patients/${someId}`], ['POST', '/patients'], ['PUT', `/patients/${someId}`], ['DELETE', `/patients/${someId}`], ['POST', `/patients/${someId}/reactivate`]]) {
      const payload = ['POST', 'PUT'].includes(method) ? body() : undefined;
      assert.strictEqual((await api(who, method, path, payload)).status, 403, `${method} ${path}`);
    }
  }
  assert.strictEqual((await api(newClient(), 'GET', '/patients')).status, 401);
  assert.strictEqual((await api(newClient(), 'GET', '/patients/me')).status, 401);
});

test('admin creates and reads a patient; the password never comes back', async () => {
  const created = await api(admin, 'POST', '/patients', body());
  assert.strictEqual(created.status, 201);
  const patient = created.json.patient;
  assert.deepStrictEqual(patient, {
    id: patient.id, firstName: 'Jean', lastName: 'Bizimana', fullName: 'Jean Bizimana', email: 'jean@exemple.test',
    birthDate: '1990-05-17', phone: '+257 79 11 22 33', active: true,
  });
  assert.doesNotMatch(created.html, /motdepasse1|passwordHash|\$2[aby]\$/);
  assert.deepStrictEqual((await api(admin, 'GET', `/patients/${patient.id}`)).json.patient, patient);
  const list = await api(admin, 'GET', '/patients');
  assert.strictEqual(list.json.patients.length, 1);
  assert.strictEqual((await apiLogin(newClient(), 'jean@exemple.test')).json.user.role, 'patient');
});

test('the list is sorted by last name', async () => {
  await api(admin, 'POST', '/patients', body({ lastName: 'Zola', email: 'z@exemple.test' }));
  await api(admin, 'POST', '/patients', body({ lastName: 'Abel', email: 'a@exemple.test' }));
  const names = (await api(admin, 'GET', '/patients')).json.patients.map((p) => p.lastName);
  assert.deepStrictEqual(names, ['Abel', 'Zola']);
});

test('validation and conflicts come back per field', async () => {
  const bad = await api(admin, 'POST', '/patients', body({ firstName: 'J', email: 'x', birthDate: '2999-01-01', password: 'court', phone: 'abc' }));
  assert.strictEqual(bad.status, 422);
  for (const field of ['firstName', 'email', 'birthDate', 'password', 'phone']) assert.ok(bad.json.error.fields[field], field);
  for (const birthDate of ['1990-02-31', '1850-01-01', '17/05/1990', '']) {
    assert.strictEqual((await api(admin, 'POST', '/patients', body({ birthDate, email: 'b@exemple.test' }))).status, 422, birthDate);
  }
  assert.strictEqual(await Patient.countDocuments(), 0);

  await api(admin, 'POST', '/patients', body());
  const dup = await api(admin, 'POST', '/patients', body());
  assert.strictEqual(dup.status, 409);
  assert.ok(dup.json.error.fields.email);
  assert.strictEqual(await Patient.countDocuments(), 1);
});

test('admin updates a patient; an empty password keeps the old one; unknown ids give 404', async () => {
  const { id } = (await api(admin, 'POST', '/patients', body())).json.patient;
  const updated = await api(admin, 'PUT', `/patients/${id}`, body({ firstName: 'Jean-Paul', birthDate: '1991-01-02', password: '' }));
  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.json.patient.firstName, 'Jean-Paul');
  assert.strictEqual(updated.json.patient.birthDate, '1991-01-02');
  assert.strictEqual((await apiLogin(newClient(), 'jean@exemple.test')).status, 200);
  for (const path of ['/patients/64b7f0c2a1b2c3d4e5f60718', '/patients/bad']) {
    assert.strictEqual((await api(admin, 'GET', path)).status, 404);
    assert.strictEqual((await api(admin, 'PUT', path, body())).status, 404);
    assert.strictEqual((await api(admin, 'DELETE', path)).status, 404);
  }
});

test('a patient reads and edits their own profile, and nobody else\'s', async () => {
  const { client } = await ownClient('Jean');
  await makePatient('Marie');
  const me = await api(client, 'GET', '/patients/me');
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.json.patient.email, 'jean@exemple.test');

  const put = await api(client, 'PUT', '/patients/me', { ...body({ email: 'jean@exemple.test', firstName: 'Jeanne', lastName: 'Pat', phone: '' }), password: '' });
  assert.strictEqual(put.status, 200);
  assert.strictEqual(put.json.patient.firstName, 'Jeanne');
  assert.strictEqual((await api(client, 'GET', '/auth/me')).json.user.fullName, 'Jeanne Pat'); // session follows

  const marie = (await api(admin, 'GET', '/patients')).json.patients.find((p) => p.email === 'marie@exemple.test');
  assert.strictEqual((await api(client, 'GET', `/patients/${marie.id}`)).status, 403);
  assert.strictEqual((await api(admin, 'GET', '/patients/me')).status, 403); // staff have no patient profile
});

test('a patient can change their password and email, with conflicts refused', async () => {
  const { client } = await ownClient('Jean');
  await makePatient('Marie');
  const clash = await api(client, 'PUT', '/patients/me', body({ email: 'marie@exemple.test', password: '' }));
  assert.strictEqual(clash.status, 409);
  assert.ok(clash.json.error.fields.email);
  const invalid = await api(client, 'PUT', '/patients/me', body({ firstName: '', password: 'court' }));
  assert.strictEqual(invalid.status, 422);

  const changed = await api(client, 'PUT', '/patients/me', body({ password: 'nouveaumotdepasse' }));
  assert.strictEqual(changed.status, 200);
  assert.strictEqual((await api(newClient(), 'POST', '/auth/login', { email: 'jean@exemple.test', password: 'motdepasse1' })).status, 401);
  assert.strictEqual((await apiLogin(newClient(), 'jean@exemple.test', 'nouveaumotdepasse')).status, 200);
});

test('deleting a patient: deleted, refused while upcoming, deactivated with history, then reactivated', async () => {
  const alone = (await api(admin, 'POST', '/patients', body({ email: 'seul@exemple.test' }))).json.patient;
  assert.deepStrictEqual((await api(admin, 'DELETE', `/patients/${alone.id}`)).json, { result: 'deleted' });
  assert.strictEqual((await api(admin, 'GET', `/patients/${alone.id}`)).status, 404);

  const doctor = await makeDoctor('Abel', cardio);
  const slot = await makeSlot(doctor, 48);
  const jean = await makePatient('Jean');
  await jean.client.request('/appointments', { method: 'POST', form: { slot: String(slot.id) } });
  const refused = await api(admin, 'DELETE', `/patients/${jean.patient.id}`);
  assert.strictEqual(refused.status, 409);
  assert.match(refused.json.error.message, /1 rendez-vous à venir/);

  const appointment = await Appointment.findOne();
  await jean.client.request(`/appointments/${appointment.id}/cancel`, { method: 'POST' });
  assert.deepStrictEqual((await api(admin, 'DELETE', `/patients/${jean.patient.id}`)).json, { result: 'deactivated' });
  assert.strictEqual((await api(admin, 'GET', `/patients/${jean.patient.id}`)).json.patient.active, false);
  assert.strictEqual((await api(newClient(), 'POST', '/auth/login', { email: 'jean@exemple.test', password: 'motdepasse1' })).status, 401);

  const back = await api(admin, 'POST', `/patients/${jean.patient.id}/reactivate`);
  assert.strictEqual(back.json.patient.active, true);
  assert.strictEqual((await apiLogin(newClient(), 'jean@exemple.test')).status, 200);
});
