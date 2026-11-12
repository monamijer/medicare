// Require this FIRST in every test file that touches the database or the app.
// Each test process gets its own throw-away database, dropped at the end.
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
const dbName = `medicare_test_${process.pid}`;
process.env.MONGODB_URI = `mongodb://127.0.0.1:27017/${dbName}`;

const mongoose = require('mongoose');

async function connect() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.syncIndexes?.();
}

async function clear() {
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
}

async function close() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}

module.exports = { connect, clear, close, dbName };
