const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const mongoose = require('mongoose');
const config = require('./env');

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // one working day
const COOKIE_NAME = 'medicare.sid';

function createSessionMiddleware() {
  // Reuse the Mongoose connection: wait until it is open (never rejects).
  const clientPromise = new Promise((resolve) => {
    const { connection } = mongoose;
    if (connection.readyState === 1) resolve(connection.getClient());
    else connection.once('open', () => resolve(connection.getClient()));
  });

  return session({
    name: COOKIE_NAME,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ clientPromise, collectionName: 'sessions', ttl: SESSION_DURATION_MS / 1000 }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      maxAge: SESSION_DURATION_MS,
    },
  });
}

module.exports = { createSessionMiddleware, COOKIE_NAME };
