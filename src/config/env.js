require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medicare',
  sessionSecret: process.env.SESSION_SECRET,
  clinicTimezone: process.env.CLINIC_TIMEZONE || 'Africa/Bujumbura',
};
