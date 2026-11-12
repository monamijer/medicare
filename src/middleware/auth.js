const User = require('../models/User');
const HttpError = require('../utils/httpError');
const { COOKIE_NAME } = require('../config/session');

const isApi = (req) => req.originalUrl.startsWith('/api/');

function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.user) return res.redirect('/');
  return next();
}

// Requires a logged-in, still-active user. The role is re-read from the database
// on every request, so deactivating a user or changing a role applies immediately.
async function requireAuth(req, res, next) {
  const sessionUser = req.session && req.session.user;
  if (!sessionUser) {
    return isApi(req) ? next(new HttpError(401, 'Authentification requise.')) : res.redirect('/login');
  }
  try {
    const user = await User.findById(sessionUser.id).select('active role');
    if (!user || !user.active) {
      return req.session.destroy(() => {
        res.clearCookie(COOKIE_NAME);
        if (isApi(req)) return next(new HttpError(401, 'Authentification requise.'));
        return res.redirect('/login');
      });
    }
    sessionUser.role = user.role;
    return next();
  } catch (err) {
    return next(err);
  }
}

// Use after requireAuth: requireRole('admin') or requireRole('admin', 'doctor').
function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.session && req.session.user;
    if (!user || !roles.includes(user.role)) {
      return next(new HttpError(403, "Vous n'avez pas accès à cette page."));
    }
    return next();
  };
}

module.exports = { redirectIfAuthenticated, requireAuth, requireRole };
