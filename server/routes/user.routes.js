const express = require('express');
const multer = require('multer');

const { registerStudent, login, getMe, setPassword } = require('../controllers/user.controller');
const authenticate = require('../middleware/verifyToken');
const loginLimiter = require('../middleware/loginLimter');
const {
  registerValidation,
  loginValidation,
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

router.post('/register', registerValidation, handleValidation, registerStudent);
router.post('/login', loginLimiter, loginValidation, handleValidation, login);
router.get('/me', authenticate, getMe);
router.post('/set-password', setPassword);

router.use(authenticate);

router.get('/profile', getMyProfile);
router.put('/profile', updateMyProfile);
router.patch('/profile/password', changeMyPassword);
router.post('/profile/picture', upload.single('photo'), uploadMyProfilePicture);

module.exports = router;
