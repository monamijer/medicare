const pkg = require('../../package.json');
const { ROLE_LABELS, getNavigation } = require('../utils/navigation');

// Variables available in every Pug template.
function viewLocals(req, res, next) {
  const user = (req.session && req.session.user) || null;

  res.locals.currentUser = user;
  res.locals.roleLabel = user ? ROLE_LABELS[user.role] : null;
  res.locals.nav = user ? getNavigation(user.role, req.path) : [];
  res.locals.appVersion = pkg.version;
  res.locals.currentYear = new Date().getFullYear();
  next();
}

module.exports = viewLocals;
