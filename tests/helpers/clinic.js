// Shared scenario builders for appointment tests: doctors, patients, slots, booking.
const Specialty = require('../../src/models/Specialty');
const Slot = require('../../src/models/AvailabilitySlot');
const Appointment = require('../../src/models/Appointment');
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

  // Invariant: every confirmed appointment sits on a booked slot with the same times,
  // and no booked slot exists without a confirmed appointment.
  async function consistency() {
    const confirmed = await Appointment.find({ status: 'confirmed' }).lean();
    const booked = await Slot.find({ status: 'booked' }).lean();
    const ids = (list) => list.map((x) => String(x._id)).sort();
    const bookedById = new Map(booked.map((b) => [String(b._id), b]));
    const timesMatch = confirmed.every((a) => {
      const slot = bookedById.get(String(a.slot));
      return slot && slot.start.getTime() === a.start.getTime() && slot.end.getTime() === a.end.getTime();
    });
    return { confirmedSlots: confirmed.map((a) => String(a.slot)).sort(), bookedSlots: ids(booked), timesMatch };
  }

  return { newClient, closeAll, consistency, makeSpecialties, makeDoctor, makePatient, makeSlot, book, loginStaff };
}

module.exports = clinicHelpers;
