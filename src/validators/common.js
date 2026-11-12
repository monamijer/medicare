const { validationResult } = require('express-validator');

// { fieldName: 'first error message' } for re-displaying a form.
function fieldErrors(req) {
  const errors = {};
  for (const error of validationResult(req).array({ onlyFirstError: true })) errors[error.path] = error.msg;
  return errors;
}

module.exports = { fieldErrors };
