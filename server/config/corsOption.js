// CORS policy.
//
// The API is consumed by a single first-party SPA, so instead of reflecting any
// origin we allow only the configured client(s). A permissive `origin: true`
// with `credentials: true` would let any site read authenticated responses,
// which is exactly what the same-origin policy is meant to prevent.
//
// Multiple origins can be supplied via CLIENT_URL as a comma-separated list so
// local dev + a deployed preview can coexist without loosening the rule.
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // No Origin header: same-origin, curl, server-to-server -> allow.
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Reject silently (no CORS headers) rather than throwing, so the browser
    // enforces the block and we avoid leaking which origins are configured.
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 600,
};

module.exports = corsOptions;
module.exports.allowedOrigins = allowedOrigins;
