const express = require('express');
const multer = require('multer');
const { CSRF_COOKIE } = require('../middleware/csrfProtection');

const {
  registerStudent,
  login,
  refreshAccessToken,
  logout,
  getMe,
  setPassword,
} = require('../controllers/user.controller');
const { forgotPassword, resetPassword, verifyResetToken } = require('../controllers/passwordReset.controller');
const authenticate = require('../middleware/verifyToken');
const loginLimiter = require('../middleware/loginLimter');
const { authLimiter, credentialLimiter, writeLimiter } = require('../middleware/rateLimiters');
const {
  registerValidation,
  loginValidation,
  forgotValidation,
  resetValidation,
  verifyTokenValidation,
  handleValidation,
} = require('../validators/auth.validator');
const {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  uploadMyProfilePicture,
} = require('../controllers/userProfile.controller');
const { acceptTerms } = require('../controllers/terms.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public auth surface. Layered limiters: a per-IP cap (authLimiter) plus a
// per-IP+email cap (credentialLimiter) so both brute force (#2) and credential
// stuffing (#3) are throttled. The original loginLimiter is kept as a coarse
// backstop so existing behaviour is preserved.
// Returns the CSRF token for this browser session. The SPA calls this before its
// first mutating request (login) because the `csrfToken` cookie is scoped to the
// API origin and is therefore unreadable from a client on a different site, as
// in production where the app is on vercel.app and the API on onrender.com.
// The browser still sends the cookie automatically (SameSite=None; Secure), so
// the server's double-submit comparison keeps working - the client only needs
// the value to echo back in X-CSRF-Token.
router.get('/csrf-token', (req, res) => {
  const issued = res.locals.csrfToken;
  const existing = req.cookies?.[CSRF_COOKIE];
  res.json({ csrfToken: existing || issued || null });
});

router.post('/register', writeLimiter, registerValidation, handleValidation, registerStudent);
router.post('/login', authLimiter, credentialLimiter, loginLimiter, loginValidation, handleValidation, login);
router.post('/refresh', refreshAccessToken);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.post('/set-password', authLimiter, setPassword);
router.post('/forgot-password', authLimiter, forgotValidation, handleValidation, forgotPassword);
router.post('/reset-password', authLimiter, resetValidation, handleValidation, resetPassword);
router.post('/verify-reset-token', authLimiter, verifyTokenValidation, handleValidation, verifyResetToken);

router.use(authenticate);

// One-time acceptance of the Terms and Agreement. Available to every signed-in
// role, not just students, because every account has to agree once.
router.post('/terms/accept', acceptTerms);

router.get('/profile', getMyProfile);
router.put('/profile', updateMyProfile);
router.patch('/profile/password', changeMyPassword);
router.post('/profile/picture', upload.single('photo'), uploadMyProfilePicture);

module.exports = router;
