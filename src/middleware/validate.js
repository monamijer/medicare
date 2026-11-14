const HttpError = require('../utils/httpError');
const { fieldErrors } = require('../validators/common');

// API: turn express-validator results into a 422 response with per-field messages.
function validate(req, res, next) {
  const errors = fieldErrors(req);
  if (Object.keys(errors).length) return next(HttpError.validation(errors));
  return next();
}

module.exports = validate;
