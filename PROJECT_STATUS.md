# PROJECT_STATUS

**Phase:** 3 — Authentication (done); Phase 2 visually confirmed by user

## Completed
- Express skeleton, env config, health endpoint
- Pug + static assets (base layout, home page)
- Centralized error handling (HTML for web, JSON for /api)
- MongoDB connection with clear French failure message (verified locally by user)
- Design tokens (`css/tokens.css`), local IBM Plex Sans, Lucide sprite (`npm run build:assets`)
- Auth: `User` model (names live on User), bcryptjs hashing, login/logout, MongoDB-backed sessions (8h, httpOnly, SameSite=Lax), `requireAuth`/`requireRole` (role + active re-checked from DB each request), `npm run create-admin`
- App shell: header + hamburger, collapsible role-based sidebar, footer, responsive (drawer < 62rem)

## Decisions
- Reference-based schemas (first/last name stored on User, Doctor/Patient reference User); slot-based availability; atomic `findOneAndUpdate` booking
- `bcryptjs` instead of `bcrypt` (no native build on Windows)
- No transactions (standalone MongoDB): atomic single-document ops + partial unique index
- Tests run on local DB `medicare_test`, no mongodb-memory-server (offline)

## Important files
- `src/app.js`, `src/server.js`, `src/config/env.js`, `src/config/database.js`, `src/middleware/errorHandler.js`, `src/middleware/viewLocals.js`, `src/utils/navigation.js`, `src/models/User.js`, `src/services/{userService,authService}.js`, `src/middleware/auth.js`, `src/config/session.js`, `src/views/{layouts,partials}`, `src/public/css/{tokens,main,layout}.css`, `src/public/js/shell.js`

## Tests
- `npm test` (node:test): 23 pass against a real MongoDB 7 (per-process DB `medicare_test_<pid>`, dropped after): health, 404s, shell/nav, user model, login/logout, RBAC
- Login page visuals not yet seen by user; no CSRF token (SameSite=Lax only), to revisit in Phase 8

## Next
- Phase 4: specialties, then doctors, then patients (incl. patient self-registration)

## Known problems
- Sidebar links point to pages not built yet (404 until their phase)
