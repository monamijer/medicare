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

module.exports = { userDto, id };
