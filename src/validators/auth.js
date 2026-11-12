const { body, validationResult } = require('express-validator');

const loginRules = [
  body('email').trim().isEmail().withMessage('Saisissez une adresse e-mail valide.'),
  body('password').notEmpty().withMessage('Saisissez votre mot de passe.'),
];

function firstError(req) {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array({ onlyFirstError: true })[0].msg;
}

module.exports = { loginRules, firstError };
