const config = require('./config/env');
const { connectDatabase } = require('./config/database');

async function start() {
  config.validate();
  await connectDatabase();
  const app = require('./app'); // loaded after validation so config errors stay readable
  app.listen(config.port, '127.0.0.1', () => {
    console.log(`MediCare démarré sur http://127.0.0.1:${config.port}`);
  });
}

start().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
