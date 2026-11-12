const { body } = require('express-validator');

const specialtyRules = [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Le nom doit contenir entre 2 et 80 caractères.'),
];

module.exports = { specialtyRules };
