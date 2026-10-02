// Security response headers (#5 XSS, plus clickjacking / sniffing hardening).
//
// `helmet()` is already applied in app.js but with defaults, which leaves the
// Content-Security-Policy disabled (helmet only sets CSP when you configure it).
// This module supplies a strict, app-specific CSP and a few extra headers.
//
// The policy is intentionally explicit:
//   - scripts only from self (Vite bundles local JS; no inline scripts, no CDN)
//   - styles from self + inline (React style props / dynamic styles need it)
//   - images from self, data:, blob: and Cloudinary (uploads live there)
//   - connect limited to self + the API/socket origin so injected scripts
//     cannot exfiltrate tokens to an attacker-controlled host
//
// `upgrade-insecure-requests` and `frame-ancestors 'none'` round out the basics.
const helmet = require('helmet');

function buildDirectives() {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  // Derive the websocket origin (ws:// or wss://) from the client URL.
  const socketOrigin = clientUrl.replace(/^http/, 'ws');

  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    scriptSrc: ["'self'"],
    // React/Vite and Leaflet inject some inline styles; style-src needs 'unsafe-inline'.
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
    fontSrc: ["'self'", 'data:'],
    connectSrc: ["'self'", clientUrl, socketOrigin, 'https://api.cloudinary.com', 'wss:'],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: [],
  };
}

const securityHeaders = [
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: buildDirectives(),
    },
    crossOriginEmbedderPolicy: false, // Cloudinary tiles fail with COEP on
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    dnsPrefetchControl: { allow: false },
  }),
  // Belt-and-braces: also send explicit headers in case a proxy strips helmet's.
  (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    next();
  },
];

module.exports = securityHeaders;
