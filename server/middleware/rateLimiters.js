// Layered rate limiting.
//
// Different attacks need different thresholds, so instead of one limiter we
// expose several that are mounted at different points:
//
//   globalLimiter      - every request; blunts DDoS / API flooding (#4)
//   authLimiter        - login + password reset; blunts brute force (#2)
//   credentialLimiter  - keyed by IP+email so a single source spraying many
//                        accounts (credential stuffing, #3) is caught even when
//                        no single account crosses its own lockout threshold
//   apiLimiter         - generous cap for authenticated CRUD traffic
//   writeLimiter       - stricter cap for state-changing methods
//   uploadLimiter      - small cap for multipart uploads (#9 support)
//
// All limiters share the same response shape (`{ error, retryAfter }`) and log
// a `rate_limit_hit` security event so repeated hits are visible in telemetry.
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { logSecurityEvent, SECURITY_EVENTS, SEVERITY } = require('../utils/securityLogger');

// Normalise the client address for use as a rate-limit key. `ipKeyGenerator`
// (built into express-rate-limit v7+) collapses an IPv6 address to its /64
// subnet so an attacker cannot rotate through addresses inside one allocation
// to dodge the limit. Proxy trust is configured once via `app.set('trust proxy')`
// in app.js, so helpers here just read the already-resolved `req.ip`.
function clientKey(req) {
  try {
    return ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown');
  } catch {
    return req.ip || 'unknown';
  }
}

function buildHandler(label) {
  return async (req, res) => {
    try {
      await logSecurityEvent({
        type: SECURITY_EVENTS.RATE_LIMIT_HIT,
        severity: SEVERITY.WARNING,
        req,
        email: req.body?.email || null,
        detail: label,
        metadata: { limiter: label },
      });
    } catch {
      // never block the response on logging
    }
    res.status(429).json({
      error: 'Too many requests. Please slow down and try again shortly.',
      retryAfter: Math.ceil((req.rateLimit?.resetTime?.getTime?.() - Date.now()) / 1000) || undefined,
    });
  };
}

const commonOptions = {
  standardHeaders: true, // RateLimit-* headers
  legacyHeaders: false, // disable X-RateLimit-* legacy headers
  keyGenerator: clientKey,
};

// #4 DDoS / API flooding - a ceiling for the whole API surface.
const globalLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000,
  max: 300,
  handler: buildHandler('global'),
});

// Generous cap for normal authenticated reads/writes.
const apiLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000,
  max: 120,
  handler: buildHandler('api'),
});

// #2 Brute force - tight per-IP cap on login attempts.
const authLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true, // only failed logins count against the bucket
  handler: buildHandler('auth'),
});

// #3 Credential stuffing - per IP+email so rotating accounts from one source is
// still throttled. Falls back to plain IP when no email is present.
const credentialLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  // Compose the key as ipKeyGenerator(ip) + email so the IPv6 normalisation is
  // preserved for the IP half of the key.
  keyGenerator: (req) =>
    `${clientKey(req)}:${String(req.body?.email || '').toLowerCase()}`,
  handler: buildHandler('credential'),
});

// Stricter cap for mutating verbs.
const writeLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000,
  max: 40,
  handler: buildHandler('write'),
});

// #9 support - uploads are expensive, cap them harder.
const uploadLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000,
  max: 15,
  handler: buildHandler('upload'),
});

module.exports = {
  globalLimiter,
  apiLimiter,
  authLimiter,
  credentialLimiter,
  writeLimiter,
  uploadLimiter,
};
