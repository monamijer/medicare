const { body } = require('express-validator');

const bookRules = [
  body('slot').isMongoId().withMessage('Créneau invalide.'),
  body('reason').trim().isLength({ max: 300 }).withMessage('Le motif ne doit pas dépasser 300 caractères.'),
];

const modifyRules = [
  body('slot').isMongoId().withMessage('Créneau invalide.'),
  body('reason').trim().isLength({ max: 300 }).withMessage('Le motif ne doit pas dépasser 300 caractères.'),
];

// API: on PUT both fields are optional (an omitted slot keeps the current one).
const apiModifyRules = [
  body('slot').optional().isMongoId().withMessage('Créneau invalide.'),
  body('reason').optional().trim().isLength({ max: 300 }).withMessage('Le motif ne doit pas dépasser 300 caractères.'),
];

module.exports = { bookRules, modifyRules, apiModifyRules };
