# PROJECT_STATUS

**Phase:** 1 — Foundation (done, pending your local MongoDB check)

## Completed
- Express skeleton, env config, health endpoint
- Pug + static assets (base layout, home page)
- Centralized error handling (HTML for web, JSON for /api)
- MongoDB connection with clear French failure message

## Decisions
- Reference-based schemas; slot-based availability; atomic `findOneAndUpdate` booking
- `bcryptjs` instead of `bcrypt` (no native build on Windows)
- No transactions (standalone MongoDB): atomic single-document ops + partial unique index
- Tests run on local DB `medicare_test`, no mongodb-memory-server (offline)

## Important files
- `src/app.js`, `src/server.js`, `src/config/env.js`, `src/config/database.js`, `src/middleware/errorHandler.js`

## Tests
- `npm test` (node:test): 5 pass (health, home, 404 web/API, DB failure message)
- MongoDB success path NOT yet verified (no mongod in build sandbox)

## Next
- Phase 2: design system (CSS variables, header, hamburger, sidebar, footer)

## Known problems
- None
