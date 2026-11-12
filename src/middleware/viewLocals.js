const pkg = require('../../package.json');
const config = require('../config/env');
const { ROLE_LABELS, getNavigation } = require('../utils/navigation');

// Variables available in every Pug template.
function viewLocals(req, res, next) {
  let user = (req.session && req.session.user) || null;

  // Temporary (removed in Phase 3): preview the shell with a fictional user.
  if (!user && config.nodeEnv !== 'production' && ROLE_LABELS[config.devPreviewRole]) {
    user = { fullName: 'Utilisateur démo', role: config.devPreviewRole };
  }

  res.locals.currentUser = user;
  res.locals.roleLabel = user ? ROLE_LABELS[user.role] : null;
  res.locals.nav = user ? getNavigation(user.role, req.path) : [];
  res.locals.appVersion = pkg.version;
  res.locals.currentYear = new Date().getFullYear();
  next();
}

module.exports = viewLocals;
