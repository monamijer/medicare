// Shared scenario builders for appointment tests: doctors, patients, slots, booking.
const Specialty = require('../../src/models/Specialty');
const Slot = require('../../src/models/AvailabilitySlot');
const doctorService = require('../../src/services/doctorService');
const patientService = require('../../src/services/patientService');
const { createClient } = require('./http');
const { loginAs } = require('./fixtures');

function clinicHelpers(app) {
  const clients = [];

  const newClient = () => {
    const client = createClient(app);
    clients.push(client);
    return client;
  };

  const closeAll = () => { while (clients.length) clients.pop().close(); };

  const makeSpecialties = () => Promise.all([Specialty.create({ name: 'Cardiologie' }), Specialty.create({ name: 'Dermatologie' })]);

  const makeDoctor = (name, specialty) => doctorService.create({
    firstName: 'Dr', lastName: name, email: `${name.toLowerCase()}@clinique.test`, password: 'motdepasse1',
    specialty: specialty.id, licenseNumber: `L-${name}`, phone: '',
  });

  async function makePatient(name) {
    const patient = await patientService.create({
      firstName: 'Pat', lastName: name, email: `${name.toLowerCase()}@exemple.test`, password: 'motdepasse1', birthDate: '1990-01-01', phone: '',
    });
    const client = newClient();
    await loginAs(client, `${name.toLowerCase()}@exemple.test`);
    return { patient, client };
  }

  const makeSlot = (doctor, startOffsetHours = 48, lengthMin = 30, status = 'free') => {
    const start = new Date(Date.now() + startOffsetHours * 3600000);
    return Slot.create({ doctor: doctor.id, start, end: new Date(start.getTime() + lengthMin * 60000), status });
  };

  const book = (client, slot, reason = '') => client.request('/appointments', {
    method: 'POST', form: { slot: String(slot.id || slot._id), reason },
  });

  const loginStaff = async (role) => {
    const client = newClient();
    await loginAs(client, `${role}@clinique.test`);
    return client;
  };

  return { newClient, closeAll, makeSpecialties, makeDoctor, makePatient, makeSlot, book, loginStaff };
}

module.exports = clinicHelpers;
