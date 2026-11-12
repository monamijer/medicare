# PROJECT_STATUS

**Phase:** 4 — Data management (done: specialties, doctors, patients); Phases 1-4b confirmed by user on Arch

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
- App shell: header + hamburger, collapsible role-based sidebar, footer, responsive (drawer < 62rem)

## Decisions
- Reference-based schemas (first/last name stored on User, Doctor/Patient reference User); slot-based availability; atomic `findOneAndUpdate` booking
- `bcryptjs` instead of `bcrypt` (no native build on Windows)
- No transactions (standalone MongoDB): atomic single-document ops + partial unique index
- Tests run on a throw-away local DB per test process, no mongodb-memory-server (offline)

## Important files
- `src/app.js`, `src/server.js`, `src/config/env.js`, `src/config/database.js`, `src/middleware/errorHandler.js`, `src/middleware/viewLocals.js`, `src/utils/navigation.js`, `src/models/User.js`, `src/services/{userService,authService}.js`, `src/middleware/auth.js`, `src/config/session.js`, `src/{models/Specialty,services/specialtyService,controllers/specialtyController,routes/web/specialties}.js`, `src/views/pages/specialties/`, `src/{models/Doctor,services/doctorService,controllers/doctorController,routes/web/doctors,validators/doctor}.js`, `src/views/pages/doctors/`, `src/views/partials/{field,patient-fields}.pug` (reusable form mixins), `src/{models/Patient,services/patientService,controllers/{patientController,accountController},routes/web/{patients,account},validators/patient,utils/dates}.js`, `src/views/pages/{patients,account}/`, `src/views/{layouts,partials}`, `src/public/css/{tokens,main,layout}.css`, `src/public/js/shell.js`

## Tests
- `npm test` (node:test): 57 pass against a real MongoDB 7 (per-process DB `medicare_test_<pid>`, dropped after): health, 404s, shell/nav, user model, login/logout, flash, RBAC, specialties, doctors, patients/registration/profile
- Confirmation dialog and notifications are JS-only and not browser-tested by me; no CSRF token (SameSite=Lax only), to revisit in Phase 8

## Next
- Phase 5: availability slots (doctor sees/creates own slots; admin can manage all; no overlaps per doctor)

## Known problems
- Deleting a doctor or patient is a hard delete; Phase 6 must refuse/deactivate when appointments exist
- Sidebar links point to pages not built yet (404 until their phase)
