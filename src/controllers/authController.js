const authService = require('../services/authService');
const { firstError } = require('../validators/auth');
const { COOKIE_NAME } = require('../config/session');

function renderLogin(res, status, email, error) {
  res.status(status).render('pages/login', { title: 'Connexion', email, error });
}

function showLogin(req, res) {
  renderLogin(res, 200, '', null);
}

async function login(req, res, next) {
  const email = req.body.email || '';
  const invalid = firstError(req);
  if (invalid) return renderLogin(res, 422, email, invalid);

  try {
    const user = await authService.authenticate(email, req.body.password);
    // New session id on login prevents session fixation.
    return req.session.regenerate((regenError) => {
      if (regenError) return next(regenError);
      req.session.user = { id: user.id, fullName: user.fullName, role: user.role };
      return req.session.save((saveError) => (saveError ? next(saveError) : res.redirect('/')));
    });
  } catch (err) {
    if (err.status === 401) return renderLogin(res, 401, email, err.message);
    return next(err);
  }
}

function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(COOKIE_NAME);
    return res.redirect('/login');
  });
}

module.exports = { showLogin, login, logout };
