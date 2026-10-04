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
    const isProduction = process.env.NODE_ENV === 'production';
    const token = generateCsrfToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      // The client is a different site in production (vercel.app -> onrender.com).
      // `strict` means the browser neither sends the cookie nor exposes it to the
      // SPA, so every POST would fail the double-submit check. `none` + `secure`
      // keeps the cookie attached on the cross-site request; the value is also
      // delivered in the response body by GET /api/users/csrf-token, because
      // script on the client origin cannot read a cookie scoped to the API origin.
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    // Only stashed for this request's handler to return. Deliberately NOT written
    // into req.cookies: csrfProtection distinguishes "no cookie arrived" by
    // reading req.cookies, and seeding it here made a cookie-less first request
    // look like it needed a matching header it could not possibly have.
    res.locals.csrfToken = token;
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

// Attributes must match those used in issueCsrfToken or the browser keeps the
// original cookie instead of clearing it.
function clearCsrfToken(res) {
  const isProduction = process.env.NODE_ENV === 'production';

  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  });
}

module.exports = { csrfProtection, issueCsrfToken, clearCsrfToken, CSRF_COOKIE, CSRF_HEADER };
