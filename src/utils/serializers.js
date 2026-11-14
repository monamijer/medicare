// What the API is allowed to show. Explicit field lists: a new database field is never exposed by accident.
const id = (value) => String(value._id || value.id || value);

function userDto(user) {
  return {
    id: id(user),
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    email: user.email,
    role: user.role,
    active: user.active !== false,
  };
}

const specialtyDto = (specialty) => ({ id: id(specialty), name: specialty.name });

// Public view: what any signed-in person may know about a doctor.
// Admins also get contact and administrative details.
function doctorDto(doctor, { admin = false } = {}) {
  const dto = {
    id: id(doctor),
    firstName: doctor.user.firstName,
    lastName: doctor.user.lastName,
    fullName: `${doctor.user.firstName} ${doctor.user.lastName}`,
    specialty: specialtyDto(doctor.specialty),
  };
  if (admin) {
    Object.assign(dto, {
      email: doctor.user.email,
      phone: doctor.phone || '',
      licenseNumber: doctor.licenseNumber,
      active: doctor.user.active !== false,
    });
  }
  return dto;
}

function patientDto(patient) {
  return {
    id: id(patient),
    firstName: patient.user.firstName,
    lastName: patient.user.lastName,
    fullName: `${patient.user.firstName} ${patient.user.lastName}`,
    email: patient.user.email,
    birthDate: new Date(patient.birthDate).toISOString().slice(0, 10),
    phone: patient.phone || '',
    active: patient.user.active !== false,
  };
}

// Doctors appear with their public view, patients by name only.
function appointmentDto(appointment) {
  const { doctor, patient } = appointment;
  return {
    id: id(appointment),
    start: appointment.start.toISOString(),
    end: appointment.end.toISOString(),
    status: appointment.status,
    reason: appointment.reason || '',
    cancelledAt: appointment.cancelledAt ? appointment.cancelledAt.toISOString() : null,
    cancelledBy: appointment.cancelledBy || null,
    doctor: doctorDto(doctor),
    patient: {
      id: id(patient),
      firstName: patient.user.firstName,
      lastName: patient.user.lastName,
      fullName: `${patient.user.firstName} ${patient.user.lastName}`,
    },
  };
}

const slotDto = (slot) => ({ id: id(slot), start: slot.start.toISOString(), end: slot.end.toISOString() });

// A doctor's own view of a slot also shows whether it is taken.
const availabilitySlotDto = (slot) => ({ ...slotDto(slot), status: slot.status });

module.exports = { userDto, specialtyDto, doctorDto, patientDto, appointmentDto, slotDto, availabilitySlotDto, id };
