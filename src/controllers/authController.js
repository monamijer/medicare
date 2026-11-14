const authService = require('../services/authService');
const { establishSession } = require('../utils/session');
const { firstError } = require('../validators/auth');

function renderLogin(res, status, email, error) {
  res.status(status).render('pages/login', { title: 'Connexion', email, error });
}

function showLogin(req, res) {
  renderLogin(res, 200, '', null);
}

function startSession(req, res, next, user, welcome) {
  establishSession(req, user)
    .then(() => {
      if (welcome) req.flash('success', welcome);
      res.redirect('/');
    })
    .catch(next);
}

async function login(req, res, next) {
  const email = req.body.email || '';
  const invalid = firstError(req);
  if (invalid) return renderLogin(res, 422, email, invalid);

  try {
    const user = await authService.authenticate(email, req.body.password);
    return startSession(req, res, next, user);
  } catch (err) {
    if (err.status === 401) return renderLogin(res, 401, email, err.message);
    return next(err);
  }
}

function logout(req, res, next) {
  // regenerate = delete the old session, then start a fresh one to carry the message.
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.flash('info', 'Vous avez été déconnecté.');
    return res.redirect('/login');
  });
}

module.exports = { showLogin, login, logout, startSession };
