# PROJECT_STATUS

**Phase:** 5 — Availability (done); Phases 1-4c delivered, 4c visually unconfirmed

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
- App shell: header + hamburger, collapsible role-based sidebar, footer, responsive (drawer < 62rem)

## Decisions
- Reference-based schemas (first/last name stored on User, Doctor/Patient reference User); slot-based availability; atomic `findOneAndUpdate` booking
- `bcryptjs` instead of `bcrypt` (no native build on Windows)
- No transactions (standalone MongoDB): atomic single-document ops + partial unique index
- Tests run on a throw-away local DB per test process, no mongodb-memory-server (offline)

## Important files
- `src/app.js`, `src/server.js`, `src/config/env.js`, `src/config/database.js`, `src/middleware/errorHandler.js`, `src/middleware/viewLocals.js`, `src/utils/navigation.js`, `src/models/User.js`, `src/services/{userService,authService}.js`, `src/middleware/auth.js`, `src/config/session.js`, `src/{models/Specialty,services/specialtyService,controllers/specialtyController,routes/web/specialties}.js`, `src/views/pages/specialties/`, `src/{models/Doctor,services/doctorService,controllers/doctorController,routes/web/doctors,validators/doctor}.js`, `src/views/pages/doctors/`, `src/views/partials/{field,patient-fields}.pug` (reusable form mixins), `src/{models/Patient,services/patientService,controllers/{patientController,accountController},routes/web/{patients,account},validators/patient,utils/dates}.js`, `src/views/pages/{patients,account}/`, `src/{models/AvailabilitySlot,services/availabilityService,controllers/availabilityController,routes/web/availability,validators/availability,utils/time}.js`, `src/views/pages/availability/`, `src/views/{layouts,partials}`, `src/public/css/{tokens,main,layout}.css`, `src/public/js/shell.js`

## Tests
- `npm test` (node:test): 74 pass against a real MongoDB 7 (per-process DB `medicare_test_<pid>`, dropped after): health, 404s, shell/nav, user model, login/logout, flash, RBAC, specialties, doctors, patients/registration/profile, time utils, availability
- Confirmation dialog and notifications are JS-only and not browser-tested by me; no CSRF token (SameSite=Lax only), to revisit in Phase 8

## Next
- Phase 6: appointments (doctor search by specialty, slot selection, atomic booking `findOneAndUpdate({status:'free'})`, modify, cancel releasing the slot, daily list, patient history); slot `status` is already `free|booked`

## Known problems
- Deleting a doctor or patient is a hard delete; Phase 6 must refuse/deactivate when appointments exist
- Overlap check is not atomic across concurrent requests with different start times (no transactions on standalone MongoDB); unique {doctor,start} covers identical starts; only doctors/admins create slots so risk is low
- Sidebar links point to pages not built yet (404 until their phase)
