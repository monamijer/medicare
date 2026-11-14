// Fictional demonstration data. Usage:
//   npm run seed              fills an EMPTY database (refuses otherwise)
//   npm run seed -- --reset   wipes the whole database first, then fills it
// Stop the application before using --reset.
const mongoose = require('mongoose');
const config = require('../src/config/env');
const { connectDatabase } = require('../src/config/database');
const User = require('../src/models/User');
const Specialty = require('../src/models/Specialty');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const Slot = require('../src/models/AvailabilitySlot');
const Appointment = require('../src/models/Appointment');
const userService = require('../src/services/userService');
const doctorService = require('../src/services/doctorService');
const patientService = require('../src/services/patientService');
const availabilityService = require('../src/services/availabilityService');
const appointmentService = require('../src/services/appointmentService');
const { addDays, today, zonedToUtc } = require('../src/utils/time');

const PASSWORD = 'MediCare2026!';
const ADMIN = { firstName: 'Admin', lastName: 'MediCare', email: 'admin@medicare.test' };

const SPECIALTIES = ['Médecine générale', 'Cardiologie', 'Pédiatrie', 'Dermatologie', 'Gynécologie', 'Ophtalmologie'];

const DOCTORS = [
  { firstName: 'Aline', lastName: 'Niyonkuru', specialty: 'Médecine générale', phone: '+257 79 100 001' },
  { firstName: 'Pascal', lastName: 'Ndayishimiye', specialty: 'Cardiologie', phone: '+257 79 100 002' },
  { firstName: 'Sandrine', lastName: 'Hakizimana', specialty: 'Pédiatrie', phone: '+257 79 100 003' },
  { firstName: 'Éric', lastName: 'Nsengiyumva', specialty: 'Dermatologie', phone: '+257 79 100 004' },
  { firstName: 'Claudine', lastName: 'Irakoze', specialty: 'Gynécologie', phone: '+257 79 100 005' },
  { firstName: 'Joël', lastName: 'Bigirimana', specialty: 'Ophtalmologie', phone: '+257 79 100 006' },
];

const PATIENTS = [
  { firstName: 'Marie', lastName: 'Uwimana', birthDate: '1988-03-14' },
  { firstName: 'Jean', lastName: 'Niyonzima', birthDate: '1975-11-02' },
  { firstName: 'Grâce', lastName: 'Ndikumana', birthDate: '2001-07-23' },
  { firstName: 'David', lastName: 'Habonimana', birthDate: '1992-01-30' },
  { firstName: 'Esther', lastName: 'Nkurunziza', birthDate: '1969-09-08' },
  { firstName: 'Samuel', lastName: 'Ntahomvukiye', birthDate: '1983-05-19' },
  { firstName: 'Olive', lastName: 'Manirakiza', birthDate: '1997-12-11' },
  { firstName: 'Patrick', lastName: 'Bukuru', birthDate: '1958-04-27' },
];

const REASONS = [
  'Consultation de contrôle', 'Douleurs thoraciques', 'Éruption cutanée', 'Vaccination',
  'Suivi de grossesse', 'Baisse de la vue', 'Fièvre persistante', 'Renouvellement d’ordonnance',
];

const slug = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const emailFor = (person) => `${slug(person.firstName)}.${slug(person.lastName)}@medicare.test`;

// The next `count` working days (Monday-Friday), starting tomorrow, in clinic time.
function nextWorkingDays(count) {
  const days = [];
  for (let offset = 1; days.length < count; offset += 1) {
    const date = addDays(today(), offset);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(date);
  }
  return days;
}

async function resetDatabase() {
  await mongoose.connection.dropDatabase();
  // Dropping removes the unique indexes the business rules rely on: rebuild them.
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
}

async function seedDemoData({ reset = false } = {}) {
  if (reset) await resetDatabase();
  else if (await User.exists({})) {
    throw new Error('La base contient déjà des données. Utilisez « npm run seed -- --reset » pour la remplacer par les données de démonstration.');
  }

  await userService.createUser({ ...ADMIN, password: PASSWORD, role: 'admin' });

  const specialties = {};
  for (const name of SPECIALTIES) specialties[name] = await Specialty.create({ name });

  const doctors = [];
  for (const [index, data] of DOCTORS.entries()) {
    doctors.push(await doctorService.create({
      ...data, email: emailFor(data), password: PASSWORD, specialty: String(specialties[data.specialty]._id),
      licenseNumber: `BI-MED-${String(1001 + index)}`,
    }));
  }

  const patients = [];
  for (const [index, data] of PATIENTS.entries()) {
    patients.push(await patientService.create({
      ...data, email: emailFor(data), password: PASSWORD, phone: `+257 61 200 ${String(100 + index)}`,
    }));
  }

  // Availability: two sessions a day (09:00-12:00, 14:00-17:00) over the next 7 working days.
  for (const doctor of doctors) {
    for (const date of nextWorkingDays(7)) {
      await availabilityService.createRange(doctor._id, { date, from: '09:00', to: '12:00', duration: '30' });
      await availabilityService.createRange(doctor._id, { date, from: '14:00', to: '17:00', duration: '30' });
    }
  }

  // Upcoming appointments, booked through the real booking rules.
  let booked = 0;
  for (let j = 0; j < 12; j += 1) {
    const doctor = doctors[j % doctors.length];
    const patient = patients[j % patients.length];
    const free = await Slot.find({ doctor: doctor._id, status: 'free', start: { $gt: new Date() } }).sort({ start: 1 }).lean();
    const slot = free[(j * 7 + 3) % free.length];
    try {
      await appointmentService.book(String(patient.user), String(slot._id), REASONS[j % REASONS.length]);
      booked += 1;
    } catch (err) {
      if (err.status !== 409) throw err; // a patient cannot hold two appointments at the same time
    }
  }

  // A little history: three past appointments and one cancelled one.
  const history = [
    { days: -2, time: '10:00', status: 'confirmed' },
    { days: -5, time: '15:30', status: 'confirmed' },
    { days: -9, time: '09:30', status: 'confirmed' },
    { days: -3, time: '11:00', status: 'cancelled' },
  ];
  for (const [index, entry] of history.entries()) {
    const doctor = doctors[(index * 2) % doctors.length];
    const patient = patients[(index * 3 + 1) % patients.length];
    const start = zonedToUtc(addDays(today(), entry.days), entry.time);
    const end = new Date(start.getTime() + 30 * 60000);
    const cancelled = entry.status === 'cancelled';
    const slot = await Slot.create({ doctor: doctor._id, start, end, status: cancelled ? 'free' : 'booked' });
    await Appointment.create({
      slot: slot._id, doctor: doctor._id, patient: patient._id, start, end, reason: REASONS[(index + 4) % REASONS.length],
      status: entry.status, ...(cancelled ? { cancelledAt: new Date(start.getTime() - 86400000), cancelledBy: 'patient' } : {}),
    });
  }

  return {
    password: PASSWORD,
    admin: ADMIN.email,
    doctors: DOCTORS.map((d) => emailFor(d)),
    patients: PATIENTS.map((p) => emailFor(p)),
    counts: {
      specialties: await Specialty.countDocuments(),
      doctors: await Doctor.countDocuments(),
      patients: await Patient.countDocuments(),
      slots: await Slot.countDocuments(),
      upcomingAppointments: booked,
      pastAppointments: history.length,
    },
  };
}

async function main() {
  config.validate();
  await connectDatabase();
  const reset = process.argv.includes('--reset');
  if (reset) console.log(`Réinitialisation de la base « ${mongoose.connection.name} »…`);
  const summary = await seedDemoData({ reset });
  console.log('\nDonnées de démonstration créées :');
  console.log(summary.counts);
  console.log(`\nMot de passe de tous les comptes : ${summary.password}`);
  console.log(`  Administrateur : ${summary.admin}`);
  console.log(`  Médecin        : ${summary.doctors[0]}   (autres : ${summary.doctors.slice(1).join(', ')})`);
  console.log(`  Patient        : ${summary.patients[0]}   (autres : ${summary.patients.slice(1).join(', ')})\n`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(`\n${err.message}\n`);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { seedDemoData, PASSWORD };
