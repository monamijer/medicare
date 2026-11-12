// Usage: npm run create-admin -- <email> <password> <firstName> <lastName>
const mongoose = require('mongoose');
const config = require('../src/config/env');
const { connectDatabase } = require('../src/config/database');
const userService = require('../src/services/userService');

async function main() {
  const [email, password, firstName, lastName] = process.argv.slice(2);
  if (!email || !password || !firstName || !lastName) {
    throw new Error('Usage : npm run create-admin -- <email> <mot_de_passe> <prénom> <nom>');
  }
  config.validate();
  await connectDatabase();
  const user = await userService.createUser({ email, password, firstName, lastName, role: 'admin' });
  console.log(`Administrateur créé : ${user.email}`);
}

main()
  .catch((err) => {
    console.error(`\n${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
