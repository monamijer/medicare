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
