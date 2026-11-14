# MediCare

Medical appointment management web app. Patients book appointments, doctors manage their
availability and agenda, administrators manage the whole clinic. The interface is in French.

## Stack

Node.js (>= 20), Express 5, Pug templates, MongoDB with Mongoose, cookie sessions stored in
MongoDB, vanilla CSS and vanilla JS (no bundler, no CSS framework).

## Getting started

```bash
npm install
# create a .env file (variables are read by src/config/env.js, including CLINIC_TIMEZONE)
npm run create-admin     # create the first administrator account
npm run dev              # start with auto-reload
npm start                # start in production mode
```

MongoDB must be running and reachable with the connection settings from `.env`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Run the server |
| `npm run dev` | Run with `node --watch` |
| `npm test` | Run the test suite (`node:test`, needs MongoDB) |
| `npm run build:assets` | Rebuild the icon sprite and copy fonts (output is committed) |
| `npm run create-admin` | Create an administrator account |

## Roles and sections

| Role | Access |
| --- | --- |
| Administrator | Home, daily agenda, appointments, doctors, patients, availability, specialties, users |
| Doctor | Home, daily agenda, own appointments, own availability |
| Patient | Home, book an appointment, own appointments, own profile |

The **Users** section (`/users`, administrators only) lists every account and lets you create,
edit, deactivate and reactivate administrator accounts. Doctor and patient accounts are managed
from their own sections because they need a profile. You cannot deactivate your own account.

## Project structure

src/
app.js, server.js Express app and entry point
config/ env, database, session
controllers/ routes/ web controllers and routes (routes/api for the REST API)
services/ models/ business logic and Mongoose schemas
validators/ middleware/ express-validator rules, auth, flash, errors, view locals
utils/ dates, time, navigation, session helpers
views/ Pug: layouts/, partials/, pages/
public/ css/, js/, assets/ (fonts, icon sprite)
tests/ node:test suites and helpers
docs/API.md REST API reference (/api/v1)
PROJECT_STATUS.md Project history, decisions and known problems


## UI shell

`views/layouts/base.pug` renders `header`, then `.app-frame` (sidebar rail + `.app-body` >
`.shell` > `main.page`), then a full-width `footer`.

- Header is sticky; the sidebar menu sticks under it on desktop.
- Sidebar state is owned by `public/js/shell.js` and exposed as `<html data-sidebar="open|closed">`.
  Desktop (>= 62rem): in-flow rail, collapsible with the hamburger (choice remembered).
  Below 62rem: off-canvas drawer with a backdrop.
- The `62rem` breakpoint in `public/css/layout.css` must match the `matchMedia` query in `shell.js`.
- CSS order: `tokens.css`, `main.css`, `layout.css`, `components.css`.

## Tests

`npm test` runs against a real MongoDB using a throw-away database per test process.

## REST API

JSON API under `/api/v1`, same cookie session as the web app. See `docs/API.md`.
