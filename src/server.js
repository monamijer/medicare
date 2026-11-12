const app = require('./app');
const config = require('./config/env');

app.listen(config.port, () => {
  console.log(`MediCare démarré sur http://127.0.0.1:${config.port}`);
});
