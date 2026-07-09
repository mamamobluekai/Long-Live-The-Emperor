const { verifyAccessToken } = require('../utils/generateToken');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access Denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
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