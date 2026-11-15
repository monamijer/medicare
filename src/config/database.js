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
      '  - Windows    : ouvrez « Services » (touche Windows, tapez services.msc),\n' +
      '                 puis démarrez « MongoDB Server (MongoDB) »\n' +
      'Guides : docs/INSTALL-WINDOWS.md et docs/INSTALL-ARCH.md'
    );
    error.cause = err;
    throw error;
  }
}

module.exports = { connectDatabase };
