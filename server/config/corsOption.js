// CORS policy.
//
// The API is consumed by a single first-party SPA, so instead of reflecting any
// origin we allow only the configured client(s). A permissive `origin: true`
// with `credentials: true` would let any site read authenticated responses,
// which is exactly what the same-origin policy is meant to prevent.
//
// Multiple origins can be supplied via CLIENT_URL as a comma-separated list so
// local dev + a deployed preview can coexist without loosening the rule.
//
// In development the Vite dev server runs on a different port than CLIENT_URL
// points at (which is usually the deployed site), so localhost must be allowed
// explicitly or every browser request from the dev server is blocked by CORS.
const LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const configuredOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Preview deployments get a different hostname on every push
// (project-<hash>-<team>.vercel.app), so listing them in CLIENT_URL means editing
// the API's environment each time. ALLOWED_ORIGIN_PATTERNS accepts comma-separated
// regular expressions for that case, e.g.
//   ^https://long-live-the-emperor-[a-z0-9-]+\.vercel\.app$
// Keep it scoped to your own project prefix: a bare `.vercel.app` pattern would
// let any Vercel deployment on the internet call this API with credentials.
const originPatterns = (process.env.ALLOWED_ORIGIN_PATTERNS || '')
  .split(',')
  .map((pattern) => pattern.trim())
  .filter(Boolean)
  .map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch (err) {
      console.error(`Ignoring invalid ALLOWED_ORIGIN_PATTERNS entry "${pattern}": ${err.message}`);
      return null;
    }
  })
  .filter(Boolean);

const allowedOrigins = Array.from(
  new Set(
    process.env.NODE_ENV === 'production'
      ? configuredOrigins
      : [...configuredOrigins, ...LOCAL_ORIGINS],
  ),
);

const corsOptions = {
  origin(origin, callback) {
    // No Origin header: same-origin, curl, server-to-server -> allow.
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    if (originPatterns.some((pattern) => pattern.test(origin))) {
      return callback(null, true);
    }

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
module.exports.allowedOriginPatterns = originPatterns.map((p) => p.source);
