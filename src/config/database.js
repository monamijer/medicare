const mongoose = require('mongoose');
const config = require('./env');

async function connectDatabase() {
  try {
    await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB connecté.');
  } catch (err) {
    const error = new Error(
      `Impossible de se connecter à MongoDB (${config.mongodbUri}).\n` +
      'Vérifiez que MongoDB est démarré :\n' +
      '  - Arch Linux : sudo systemctl start mongodb\n' +
      '  - Windows    : service "MongoDB Server" (services.msc)'
    );
    error.cause = err;
    throw error;
  }
}

module.exports = { connectDatabase };
