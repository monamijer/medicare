const config = require('../config/env');

function notFound(req, res, next) {
  const err = new Error('Page introuvable');
  err.status = 404;
  next(err);
}

function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = status === 500 && config.nodeEnv === 'production'
    ? 'Une erreur interne est survenue.'
    : err.message;

  if (status === 500) console.error(err);

  if (req.originalUrl.startsWith('/api/')) {
    return res.status(status).json({ error: { status, message } });
  }
  res.status(status).render('errors/error', { title: `Erreur ${status}`, status, message });
}

module.exports = { notFound, errorHandler };
