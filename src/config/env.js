require('dotenv').config({ quiet: true });

const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medicare',
  sessionSecret: process.env.SESSION_SECRET,
  // bcrypt work factor: 10 is a sound default; tests lower it to run faster.
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  clinicTimezone: process.env.CLINIC_TIMEZONE || 'Africa/Bujumbura',
};

// Called at startup so a missing secret gives a clear message instead of a stack trace.
config.validate = function validate() {
  if (!config.sessionSecret) {
    throw new Error('SESSION_SECRET est manquant. Copiez .env.example vers .env et renseignez une valeur secrète.');
  }
};

module.exports = config;
