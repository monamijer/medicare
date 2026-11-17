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

## Index

`GET /api/v1` (no login needed) returns a small JSON index: the API name and version, where the documentation is,
how to authenticate, and every resource with who may use it.

**Trying it in a browser:** sign in to the web application first (`/login`). The API uses the same session cookie, so
every `GET` address of this document then opens directly in the browser tab, for example `/api/v1/doctors` or
`/api/v1/appointments`. Without being signed in, those addresses answer `401`. Writing requests (`POST`, `PUT`,
`DELETE`) need a tool such as Postman or `curl`.

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

## Availability (slots)

For doctors (their own slots) and admins (any doctor's). Patients get `403`.
A doctor always works on their own slots; an admin names the doctor with `?doctor=<id>` (or a `doctor` field in the body),
otherwise `422` with `fields.doctor`.

Times are UTC ISO 8601. `timezone` (the clinic zone) tells you how to display them.
Slot shape: `{ id, start, end, status }` with `status` `free` or `booked`.

| Method and path | Result |
|---|---|
| `GET /availability` | `200 { timezone, doctor: { id, fullName }, slots: [...] }`: upcoming slots, earliest first |
| `POST /availability` | `201 { created: <count> }` |
| `GET /availability/:id` | `200 { slot }`, `404` (also for another doctor's slot) |
| `PUT /availability/:id` | `200 { slot }`: moves a **free** slot |
| `DELETE /availability/:id` | `204`: deletes a **free** slot |

`POST` body: `{ date "YYYY-MM-DD" (clinic time, in the future), from "HH:mm", to "HH:mm", duration? }`.
The range is cut into back-to-back slots of `duration` minutes (15, 20, 30, 45 or 60; default 30; `0` = one single slot
covering the whole range; at most 48 slots per request; a leftover shorter than `duration` is dropped).
`PUT` body: `{ date, from, to }`.

Rules: a doctor's slots never overlap (`409` with `fields.date` naming the clash; touching slots are fine); a booked slot
cannot be moved or deleted (`409`, cancel its appointment first); no slots for a deactivated doctor (`409`).

## Appointments

Appointment shape:

```json
{
  "id": "...", "start": "2027-03-10T07:00:00.000Z", "end": "2027-03-10T07:30:00.000Z",
  "status": "confirmed", "reason": "Douleurs", "cancelledAt": null, "cancelledBy": null,
  "doctor": { "id": "...", "firstName": "...", "lastName": "...", "fullName": "...", "specialty": { "id": "...", "name": "..." } },
  "patient": { "id": "...", "firstName": "...", "lastName": "...", "fullName": "..." }
}
```

`status` is `confirmed` or `cancelled`; `cancelledBy` is `patient`, `doctor` or `admin`. Times are UTC; list responses
carry `timezone` (the clinic zone). Doctors appear with their public view only.
You only ever see your own appointments (patients: theirs, doctors: theirs, admins: all); anything else is `404`.

| Method and path | Role | Result |
|---|---|---|
| `GET /appointments` | any | `200 { timezone, upcoming: [...], history: [...] }`; `history` = past and cancelled ones |
| `GET /appointments/day?date=YYYY-MM-DD` | doctor, admin | `200 { timezone, date, appointments: [...] }`: confirmed appointments of that clinic-local day by time; `date` defaults to today; `422` for an invalid date |
| `GET /appointments/:id` | any | `200 { appointment }`, `404` |
| `POST /appointments` `{ slot, reason? }` | patient | `201 { appointment }`; the slot is booked atomically |
| `PUT /appointments/:id` `{ slot?, reason? }` | patient, admin | `200 { appointment }`; omit `slot` to keep it, omit `reason` to keep it |
| `POST /appointments/:id/cancel` | any owner, admin | `200 { appointment }`; the slot becomes free again |

Booking and modification rules (all return `409` with `fields.slot` unless noted):

- a slot that is taken, past, or belongs to a deactivated doctor is "plus disponible"; unknown slot ids are `404`, malformed ones `422`;
- a patient cannot hold two appointments at the same time;
- modification keeps the **same doctor** (`422` for another doctor's slot; to change doctor, cancel and book again);
- cancelled or past appointments cannot be modified or cancelled (`409`);
- simultaneous requests never double-book a slot: with several patients racing for one slot, exactly one gets `201`.

`reason` is optional text of at most 300 characters (`422` beyond that).
