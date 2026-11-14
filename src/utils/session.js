// Starts a logged-in session. A new session id on login prevents session fixation.
function establishSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((regenError) => {
      if (regenError) return reject(regenError);
      req.session.user = { id: user.id, firstName: user.firstName, fullName: user.fullName, role: user.role };
      return req.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
    });
  });
}

module.exports = { establishSession };
