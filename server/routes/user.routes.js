const express = require('express');
const multer = require('multer');

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

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public auth surface. Layered limiters: a per-IP cap (authLimiter) plus a
// per-IP+email cap (credentialLimiter) so both brute force (#2) and credential
// stuffing (#3) are throttled. The original loginLimiter is kept as a coarse
// backstop so existing behaviour is preserved.
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

router.get('/profile', getMyProfile);
router.put('/profile', updateMyProfile);
router.patch('/profile/password', changeMyPassword);
router.post('/profile/picture', upload.single('photo'), uploadMyProfilePicture);

module.exports = router;
