const { verifyAccessToken } = require('../utils/generateToken');
const { isAccessTokenRevoked } = require('../utils/tokenStore');

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

    req.user = decoded;
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
