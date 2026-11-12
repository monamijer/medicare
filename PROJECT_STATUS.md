# PROJECT_STATUS

**Phase:** 1 — Foundation (in progress)

## Completed
- Express app skeleton, env config, health endpoint, first test

## Decisions
- Reference-based schemas; slot-based availability; atomic `findOneAndUpdate` booking
- `bcryptjs` instead of `bcrypt` (no native build on Windows)
- No transactions (standalone MongoDB): atomic single-document ops + partial unique index
- Tests run on local DB `medicare_test`, no mongodb-memory-server (offline)

## Important files
- `src/app.js`, `src/server.js`, `src/config/env.js`

## Tests
- `npm test` (node:test): health endpoint passes

## Next
- Pug templates, static assets, error handling

## Known problems
- None
