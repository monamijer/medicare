const { body } = require('express-validator');

const bookRules = [
  body('slot').isMongoId().withMessage('Créneau invalide.'),
  body('reason').trim().isLength({ max: 300 }).withMessage('Le motif ne doit pas dépasser 300 caractères.'),
];

const modifyRules = [
  body('slot').isMongoId().withMessage('Créneau invalide.'),
  body('reason').trim().isLength({ max: 300 }).withMessage('Le motif ne doit pas dépasser 300 caractères.'),
];

module.exports = { bookRules, modifyRules };
