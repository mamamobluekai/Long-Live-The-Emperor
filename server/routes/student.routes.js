const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const {
  getMyRequirements,
  updateMyRequirements,
  submitMyRequirements,
  uploadMyDocument,
  deleteMyDocument,
  getMySubmissionStatus,
} = require('../controllers/studentControllers/student.controller');
const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');

const router = express.Router();
const uploadsDir = path.join(__dirname, '../uploads/requirements');
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `${unique}${ext}`);
    },
  }),
});

router.use(authenticate);

router.get('/requirements/me', authorize('student'), getMyRequirements);
router.get('/requirements/me/status', authorize('student'), getMySubmissionStatus);
router.put('/requirements/me', authorize('student'), updateMyRequirements);
router.post('/requirements/me/submit', authorize('student'), submitMyRequirements);
router.post('/documents/me/upload', authorize('student'), upload.single('file'), uploadMyDocument);
router.delete('/documents/me/:id', authorize('student'), deleteMyDocument);

module.exports = router;
