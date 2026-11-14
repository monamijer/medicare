# PROJECT_STATUS

**Phase:** 7 — REST API (7a-7b done: foundation, auth, specialties, doctors); Phase 8 (finalization) ends the project; Phases 1-5 delivered, 4c/5 visually unconfirmed

## Completed
- Express skeleton, env config, health endpoint
- Pug + static assets (base layout, home page)
- Centralized error handling (HTML for web, JSON for /api)
- MongoDB connection with clear French failure message (verified locally by user)
- Design tokens (`css/tokens.css`), local IBM Plex Sans, Lucide sprite (`npm run build:assets`)
- Auth: `User` model (names live on User), bcryptjs hashing, login/logout, MongoDB-backed sessions (8h, httpOnly, SameSite=Lax), `requireAuth`/`requireRole` (role + active re-checked from DB each request), `npm run create-admin`
- Flash notifications, native `<dialog>` confirmation (`data-confirm` on forms), table/empty-state/form components (`css/components.css`, `js/ui.js`)
- Specialties (admin only): list, create, edit, delete; unique ignoring case/accents (collation fr strength 1)
- Doctors (admin only): list, view, create, edit, delete; creating a doctor creates a `doctor` login account (rolled back if the profile fails); empty password on edit keeps the old one; licence number unique
- A specialty used by a doctor cannot be deleted
- Patients: admin CRUD; public self-registration at `/register` (always role `patient`, logs the user in); patients edit their own info at `/profile` (header name kept in sync); birth date validated (no future, >= 1900) and shown dd/mm/yyyy
- Availability (Phase 5): `AvailabilitySlot` (doctor, start, end, status free/booked; unique {doctor,start}). Doctors manage own slots, admins any doctor's via `?doctor=<id>` (also linked from the doctor page). One form adds a range split into 15/20/30/45/60-min slots or one single slot (max 48); overlaps refused (adjacent OK); edit/delete only while free; times typed in clinic time (`CLINIC_TIMEZONE`) and stored in UTC; list shows upcoming slots grouped by day
- Appointments step 1: `Appointment` (slot, doctor, patient, start/end copied from slot, status confirmed|cancelled, reason<=300; partial unique index on slot where confirmed). Patient flow: `/appointments/new` (pick specialty -> doctors with free-slot counts) -> `/appointments/new/:doctorId` (free upcoming slots by day) -> `/appointments/book/:slotId` (confirm + optional reason) -> POST `/appointments`. Booking = atomic `findOneAndUpdate({status:'free', start>now}) -> booked`, then create appointment, slot released if creation fails. A patient cannot hold two overlapping appointments. `/appointments` lists upcoming + history, scoped by role (patient own, doctor own, admin all)
- Appointments step 2: POST `/appointments/:id/cancel` (patient own, doctor own, admin any; others get 404). Appointment is cancelled atomically first (`status:'confirmed', start>now`), then its slot is released (`status:'booked'` guard), so a double cancel cannot free a re-booked slot. Past or already-cancelled appointments are refused with a message. `cancelledAt`/`cancelledBy` kept; history shows who cancelled
- Appointments step 3: `/appointments/:id/edit` + POST `/appointments/:id` (patient own, admin any; doctors 403, others 404). Move to another free slot of the SAME doctor and/or change the reason. Safe order: claim new slot -> switch appointment (guarded by `status:'confirmed'` and its current slot) -> release old slot; any failure releases the claimed slot. A slot that vanished or was taken gives a normal message, not a 404 page. Tests assert the invariant (booked slots == confirmed appointments' slots, times match) under concurrent move/move and move/cancel
- Appointments step 4a: `/appointments/day?date=YYYY-MM-DD` (doctor own, admin all; patients 403): confirmed appointments of one clinic-local day in time order, previous/today/next links and a date picker, invalid date -> redirect with message; days cut at clinic midnight (DST-safe). Menu entry "Agenda du jour" (doctor, admin)
- Appointments step 4b (retention): deleting a doctor/patient is refused while they have upcoming confirmed appointments (cancel first); deactivated (user.active=false, record + history kept, doctor's free slots removed) when only past/cancelled appointments exist; hard-deleted only when no appointment ever referenced them. Deactivated doctors are hidden from search, cannot be booked or given slots; admin lists show a "Désactivé" badge and a Réactiver button. Lists skip appointments whose doctor/patient record is gone (legacy orphans)
- REST API 7a (`/api/v1`, docs in `docs/API.md`): JSON-only writes (415 otherwise, empty body ok), errors `{error:{status,message,fields?}}`, validation via `middleware/validate.js` (422 + per-field messages), explicit serializers (`utils/serializers.js`), shared `utils/session.js`. Endpoints: GET /health, POST /auth/login|logout|register, GET /auth/me; /specialties (CRUD), /doctors (CRUD, reactivate, `/:id/slots`; public view for non-admins, deactivated doctors hidden). Same cookie session as the web app
- App shell: header + hamburger, collapsible role-based sidebar, footer, responsive (drawer < 62rem)

## Decisions
- Reference-based schemas (first/last name stored on User, Doctor/Patient reference User); slot-based availability; atomic `findOneAndUpdate` booking
- `bcryptjs` instead of `bcrypt` (no native build on Windows)
- No transactions (standalone MongoDB): atomic single-document ops + partial unique index
- Tests run on a throw-away local DB per test process, no mongodb-memory-server (offline)

## Important files
- `src/app.js`, `src/server.js`, `src/config/env.js`, `src/config/database.js`, `src/middleware/errorHandler.js`, `src/middleware/viewLocals.js`, `src/utils/navigation.js`, `src/models/User.js`, `src/services/{userService,authService}.js`, `src/middleware/auth.js`, `src/config/session.js`, `src/{models/Specialty,services/specialtyService,controllers/specialtyController,routes/web/specialties}.js`, `src/views/pages/specialties/`, `src/{models/Doctor,services/doctorService,controllers/doctorController,routes/web/doctors,validators/doctor}.js`, `src/views/pages/doctors/`, `src/views/partials/{field,patient-fields}.pug` (reusable form mixins), `src/{models/Patient,services/patientService,controllers/{patientController,accountController},routes/web/{patients,account},validators/patient,utils/dates}.js`, `src/views/pages/{patients,account}/`, `src/{models/AvailabilitySlot,services/availabilityService,controllers/availabilityController,routes/web/availability,validators/availability,utils/time}.js`, `src/views/pages/availability/`, `src/{models/Appointment,services/appointmentService,controllers/appointmentController,routes/web/appointments,validators/appointment,utils/slotGroups}.js`, `src/views/pages/appointments/`, `tests/helpers/clinic.js` (shared scenario builders), `src/views/{layouts,partials}`, `src/public/css/{tokens,main,layout}.css`, `src/public/js/shell.js`

## Tests
- `npm test` (node:test): 148 pass against a real MongoDB 7 (per-process DB `medicare_test_<pid>`, dropped after): health, 404s, shell/nav, user model, login/logout, flash, RBAC, specialties, doctors, patients/registration/profile, time utils, availability, booking (incl. 8-way concurrent booking), cancellation, modification (incl. races), daily agenda, retention (delete/deactivate/refuse)
- Confirmation dialog and notifications are JS-only and not browser-tested by me; no CSRF token (SameSite=Lax only), to revisit in Phase 8

## Next
- Phase 7c: patients (+ `/patients/me`); 7d: availability; 7e: appointments (book, list, day, modify, cancel). Update `docs/API.md` in each step. Then Phase 8: seed data + demo accounts, Windows/Arch install guides, final README, compatibility check

## Known problems
- Mongoose 9: use `returnDocument: 'after'` (not `new: true`) so findOneAndUpdate returns the updated document
- A booking that lands in the same instant a doctor is deleted/deactivated could slip through (checked just before, no transactions); tiny window
- If the process dies between claiming a slot and creating its appointment, the slot stays `booked` without appointment (no transactions); a reconcile script could free such slots
- Overlap check is not atomic across concurrent requests with different start times (no transactions on standalone MongoDB); unique {doctor,start} covers identical starts; only doctors/admins create slots so risk is low
- Sidebar links point to pages not built yet (404 until their phase)
