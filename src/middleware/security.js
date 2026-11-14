const HttpError = require('../utils/httpError');

// Everything the pages load comes from this server: no CDN, no inline script or style.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  next();
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF defence in depth (the session cookie is also SameSite=Lax): browsers always send an
// Origin header on cross-site POST/PUT/DELETE, so a request claiming to come from another
// site is refused. Requests without Origin (curl, Postman, the test client) are not browsers.
function sameOriginOnly(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin === undefined) return next();
  let host = null;
  try {
    host = new URL(origin).host;
  } catch (err) {
    host = null; // "null" origin (sandboxed pages) and garbage
  }
  if (host && host === req.get('host')) return next();
  return next(new HttpError(403, 'Requête refusée : elle ne provient pas de ce site.'));
}

module.exports = { securityHeaders, sameOriginOnly, CONTENT_SECURITY_POLICY };
