const { verifyAccessToken } = require('../utils/generateToken');
const { isAccessTokenRevoked } = require('../utils/tokenStore');
const pool = require('../db');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if ((!authHeader || !authHeader.startsWith('Bearer ')) && !req.query.token) {
    return res.status(401).json({ error: 'Access Denied. No token provided.' });
  }

  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.query.token;

  try {
    const decoded = verifyAccessToken(token);

    // Session revocation (#7): a token whose jti is on the deny-list was
    // explicitly logged out or force-terminated and must be rejected even
    // though its signature and expiry are still valid.
    if (decoded?.jti && (await isAccessTokenRevoked(decoded.jti))) {
      return res.status(401).json({
        error: 'Session has been revoked.',
        details: 'This session was signed out. Please log in again.',
      });
    }

    // The token payload is not authoritative for identity or authorisation. A
    // role change, demotion or account freeze must take effect immediately
    // rather than whenever the (1h) access token happens to expire, so the
    // current role/status is re-read from the users table on every request.
    let current;
    try {
      const result = await pool.query(
        'SELECT id, email, role, status FROM users WHERE id = $1',
        [decoded.id]
      );
      current = result.rows[0];
    } catch (err) {
      console.error('User lookup failed:', err.message, 'path=', req.path);
      return res.status(503).json({ error: 'Unable to verify account. Please try again.' });
    }

    if (!current) {
      return res.status(401).json({
        error: 'Account no longer exists.',
        details: 'This account was removed. Please log in again.',
      });
    }

    // Block exactly the statuses login blocks, rather than demanding
    // status === 'approved'. Status strings are stored inconsistently across
    // this schema (deployment_requests use 'Approved', some hand-edited rows
    // vary), so an equality test here would 403 accounts that can log in
    // perfectly well. Mirroring the login gates keeps the two in step.
    const status = String(current.status || '').trim().toLowerCase();
    const BLOCKED_STATUSES = new Set(['pending', 'disapproved']);

    if (BLOCKED_STATUSES.has(status)) {
      return res.status(403).json({
        error: status === 'pending'
          ? 'Your account is still pending approval.'
          : 'Your account was not approved.',
        details: 'Please contact an administrator.',
      });
    }

    req.user = { ...decoded, ...current };
    next();
  } catch (err) {
    console.error('verifyAccessToken failed:', err.name, err.message, 'path=', req.path, 'method=', req.method);
    return res.status(401).json({
      error: 'Invalid or expired token.',
      details: err.name === 'TokenExpiredError' ? 'Access token expired. Please log in again.' : 'Invalid token.',
    });
  }
};

module.exports = authenticate;
