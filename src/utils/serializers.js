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

const slotDto = (slot) => ({ id: id(slot), start: slot.start.toISOString(), end: slot.end.toISOString() });

module.exports = { userDto, specialtyDto, doctorDto, slotDto, id };
