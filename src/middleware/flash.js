// One-time messages that survive a redirect: req.flash('success', 'Message').
function flash(req, res, next) {
  req.flash = (type, message) => {
    req.session.flash = [...(req.session.flash || []), { type, message }];
  };
  res.locals.flash = req.session.flash || [];
  delete req.session.flash;
  next();
}

module.exports = flash;
