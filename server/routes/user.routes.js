const express = require('express');

const { registerStudent, login, getMe, setPassword } = require('../controllers/user.controller');
const authenticate = require('../middleware/verifyToken');
const loginLimiter = require('../middleware/loginLimter');
const {
  registerValidation,
  loginValidation,
  handleValidation,
} = require('../validators/auth.validator');

const router = express.Router();

router.post('/register', registerValidation, handleValidation, registerStudent);
router.post('/login', loginLimiter, loginValidation, handleValidation, login);
router.get('/me', authenticate, getMe);
router.post('/set-password', setPassword);

module.exports = router;
