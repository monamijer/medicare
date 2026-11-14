const HttpError = require('../utils/httpError');

// API writes must be JSON. Empty bodies (logout, cancel...) are fine.
function apiJson(req, res, next) {
  const emptyBody = req.headers['content-length'] === '0';
  if (!emptyBody && ['POST', 'PUT', 'PATCH'].includes(req.method) && req.is('json') === false) {
    return next(new HttpError(415, 'Le corps de la requête doit être au format JSON (Content-Type: application/json).'));
  }
  return next();
}

module.exports = apiJson;
