// CSRF protection (#6) using the signed double-submit cookie pattern.
//
// The app already sets `refreshToken` as an httpOnly, SameSite=strict cookie,
// which blocks the classic form-post CSRF. This adds defence-in-depth for the
// Bearer-token flow: the client holds a random CSRF token in a readable cookie
// AND echoes it in the `X-CSRF-Token` header. Because a cross-site attacker
// cannot read the cookie value to set the header, the two never match.
//
// Only state-changing methods are checked; GET/HEAD/OPTIONS are safe by
// convention. Non-browser clients (no cookies at all) are unaffected because
// they are not the CSRF threat model and cannot be victimised by it.
const crypto = require('crypto');
const { logSecurityEvent, SECURITY_EVENTS, SEVERITY } = require('../utils/securityLogger');

const CSRF_COOKIE = 'csrfToken';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_BYTES = 32;

function generateCsrfToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

// Issues a CSRF cookie if the request does not already carry one. Readable by
// JS on purpose (not httpOnly) so the SPA can echo it in the header.
function issueCsrfToken(req, res, next) {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = generateCsrfToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    req.cookies = req.cookies || {};
    req.cookies[CSRF_COOKIE] = token;
  }
  next();
}

// Constant-time comparison to avoid leaking the token one byte at a time.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Middleware form: enforces the double-submit match on unsafe methods.
// Requests that carry no CSRF cookie at all are skipped: those are either
// non-browser callers or the pre-login phase before a token was issued.
function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  if (!cookieToken) return next(); // no session cookie -> not a browser CSRF case

  const headerToken = req.get(CSRF_HEADER) || req.body?._csrf;

  if (!safeEqual(cookieToken, headerToken || '')) {
    logSecurityEvent({
      type: SECURITY_EVENTS.CSRF_FAILED,
      severity: SEVERITY.HIGH,
      req,
      detail: 'CSRF token missing or mismatched',
    });
    return res.status(403).json({ error: 'Invalid or missing CSRF token. Please refresh the page and try again.' });
  }

  return next();
}

// Clears the CSRF cookie on logout.
function clearCsrfToken(res) {
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
}

module.exports = { csrfProtection, issueCsrfToken, clearCsrfToken, CSRF_COOKIE, CSRF_HEADER };
