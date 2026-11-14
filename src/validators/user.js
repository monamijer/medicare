const { body } = require('express-validator');
const { MIN_PASSWORD_LENGTH } = require('../services/userService');

const common = [
  body('firstName').trim().isLength({ min: 2, max: 60 }).withMessage('Le prénom doit contenir entre 2 et 60 caractères.'),
  body('lastName').trim().isLength({ min: 2, max: 60 }).withMessage('Le nom doit contenir entre 2 et 60 caractères.'),
  body('email').trim().isEmail().withMessage('Saisissez une adresse e-mail valide.'),
];

const passwordMessage = `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;

const createRules = [...common, body('password').isLength({ min: MIN_PASSWORD_LENGTH }).withMessage(passwordMessage)];
const updateRules = [
  ...common,
  body('password').optional({ values: 'falsy' }).isLength({ min: MIN_PASSWORD_LENGTH }).withMessage(passwordMessage),
];

module.exports = { createRules, updateRules };
