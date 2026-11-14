# MediCare REST API

Base URL: `http://127.0.0.1:3000/api/v1`

The API uses the same business rules as the web pages (same services), so every rule
(no double booking, no overlapping slots...) applies identically.

## Conventions

- **Format:** requests and responses are JSON (`Content-Type: application/json`).
  A non-JSON body gets `415`, broken JSON gets `400`. Requests without a body are fine.
- **Authentication:** cookie session. `POST /auth/login` (or `/auth/register`) sets the
  `medicare.sid` cookie; send it back on every request (browsers and tools like Postman do it
  automatically). The cookie is `HttpOnly` and `SameSite=Lax`.
- **Language:** error messages are in French.
- **Never returned:** passwords or password hashes.

### Errors

Every error has the same shape:

```json
{ "error": { "status": 422, "message": "Les données envoyées sont invalides.", "fields": { "email": "Saisissez une adresse e-mail valide." } } }
```

`fields` is present for validation and conflict errors that concern one or more inputs.

| Status | Meaning |
|---|---|
| 400 | Broken JSON |
| 401 | Not signed in, or wrong credentials |
| 403 | Signed in, but this role may not do this |
| 404 | Unknown route or record (also used for records you do not own) |
| 409 | Conflict with the current state (duplicate, slot taken, overlap...) |
| 415 | Body is not JSON |
| 422 | Invalid input |
| 500 | Unexpected server error |

## Health

`GET /health` -> `200 {"status":"ok"}` (no login needed)

## Authentication

### `POST /auth/login`
Body: `{ "email": "...", "password": "..." }`
`200 { "user": { id, firstName, lastName, fullName, email, role, active } }` and the session cookie.
`401` for a wrong password, an unknown email or a deactivated account (same message for all three).
`422` for a malformed email or an empty password.

### `POST /auth/logout`
`204`, session ended. Safe to call when not signed in.

### `GET /auth/me`
`200 { "user": {...} }` for the signed-in user, `401` otherwise.

### `POST /auth/register`
Patient self-registration; the new patient is signed in.
Body: `{ firstName, lastName, email, password (8+ chars), birthDate "YYYY-MM-DD", phone? }`
`201 { "user": {...} }`. `409` if the email is taken, `422` for invalid fields.
The role is always `patient`; a submitted `role` is ignored.

## Specialties

Reading needs a login (any role); writing is admin only.

| Method and path | Role | Result |
|---|---|---|
| `GET /specialties` | any | `200 { specialties: [{ id, name }] }`, sorted in French order |
| `GET /specialties/:id` | any | `200 { specialty }`, `404` |
| `POST /specialties` `{ name }` | admin | `201 { specialty }`; `409` duplicate (case and accents ignored); `422` name not 2-80 characters |
| `PUT /specialties/:id` `{ name }` | admin | `200 { specialty }`; `409`, `422`, `404` |
| `DELETE /specialties/:id` | admin | `204`; `409` while a doctor uses it |

## Doctors

Any signed-in user sees a **public** view of active doctors:
`{ id, firstName, lastName, fullName, specialty: { id, name } }`.
Admins see more: `email`, `phone`, `licenseNumber`, `active`. Deactivated doctors are `404` for everyone but admins.

| Method and path | Role | Result |
|---|---|---|
| `GET /doctors?specialty=<id>` | any | `200 { doctors: [...] }` sorted by name; `422` if `specialty` is not a valid id |
| `GET /doctors/:id` | any | `200 { doctor }`, `404` |
| `GET /doctors/:id/slots` | any | `200 { timezone, slots: [{ id, start, end }] }`: upcoming **free** slots, times in UTC ISO 8601; `timezone` is the clinic zone to display them in |
| `POST /doctors` | admin | `201 { doctor }`; creates the doctor's login account too |
| `PUT /doctors/:id` | admin | `200 { doctor }`; an empty `password` keeps the current one |
| `DELETE /doctors/:id` | admin | `200 { result: "deleted" }` or `{ result: "deactivated" }` (history kept); `409` while upcoming appointments exist |
| `POST /doctors/:id/reactivate` | admin | `200 { doctor }` |

Body for `POST`/`PUT /doctors`:
`{ firstName, lastName, email, password (8+ chars, optional on PUT), specialty (id), licenseNumber, phone? }`.
`409` on a duplicate `email` or `licenseNumber` (see `error.fields`), `422` on invalid values.

## Patients

Patient records contain personal data, so only admins can list or read other patients.
Shape: `{ id, firstName, lastName, fullName, email, birthDate "YYYY-MM-DD", phone, active }`.

| Method and path | Role | Result |
|---|---|---|
| `GET /patients/me` | patient | `200 { patient }` your own profile |
| `PUT /patients/me` | patient | `200 { patient }`; same body as below; an empty `password` keeps the current one |
| `GET /patients` | admin | `200 { patients: [...] }` sorted by name |
| `GET /patients/:id` | admin | `200 { patient }`, `404` |
| `POST /patients` | admin | `201 { patient }`; creates the patient's login account too |
| `PUT /patients/:id` | admin | `200 { patient }` |
| `DELETE /patients/:id` | admin | `200 { result: "deleted" }` or `{ result: "deactivated" }` (history kept); `409` while upcoming appointments exist |
| `POST /patients/:id/reactivate` | admin | `200 { patient }` |

Body for `POST`/`PUT`:
`{ firstName, lastName, email, password (8+ chars, optional on PUT), birthDate "YYYY-MM-DD" (not in the future, 1900 or later), phone? }`.
`409` on a duplicate `email`, `422` on invalid values (see `error.fields`).
Staff (admin, doctor) have no patient profile: `/patients/me` is `403` for them.
