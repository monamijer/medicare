# PROJECT_STATUS

**Phase:** 2 — Design system (done; visual check by user pending)

## Completed
- Express skeleton, env config, health endpoint
- Pug + static assets (base layout, home page)
- Centralized error handling (HTML for web, JSON for /api)
- MongoDB connection with clear French failure message (verified locally by user)
- Design tokens (`css/tokens.css`), local IBM Plex Sans, Lucide sprite (`npm run build:assets`)
- App shell: header + hamburger, collapsible role-based sidebar, footer, responsive (drawer < 62rem)

## Decisions
- Reference-based schemas; slot-based availability; atomic `findOneAndUpdate` booking
- `bcryptjs` instead of `bcrypt` (no native build on Windows)
- No transactions (standalone MongoDB): atomic single-document ops + partial unique index
- Tests run on local DB `medicare_test`, no mongodb-memory-server (offline)

## Important files
- `src/app.js`, `src/server.js`, `src/config/env.js`, `src/config/database.js`, `src/middleware/errorHandler.js`, `src/middleware/viewLocals.js`, `src/utils/navigation.js`, `src/views/{layouts,partials}`, `src/public/css/{tokens,main,layout}.css`, `src/public/js/shell.js`

## Tests
- `npm test` (node:test): 10 pass (health, home, 404 web/API, DB failure message, shell/nav)
- Visual/responsive rendering not screenshot-tested (no browser in build sandbox)

## Next
- Phase 3: authentication (User model, login, sessions, authorization, logout); remove `DEV_PREVIEW_ROLE`

## Known problems
- Sidebar links point to pages not built yet (404 until their phase)
- `DEV_PREVIEW_ROLE` in `.env` is temporary (shows the shell without login)
