const express = require('express');
const multer = require('multer');
const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');
const {
  uploadFile,
  getMyFiles,
  getAllFiles,
  getFileById,
  deleteFile,
} = require('../controllers/fileController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate);

router.post('/upload', authorize('student'), upload.single('file'), uploadFile);
router.get('/my-files', authorize('student'), getMyFiles);
router.get('/all', authorize('teacher', 'coordinator', 'admin'), getAllFiles);
router.get('/:id', authorize('student', 'teacher', 'coordinator', 'admin'), getFileById);
router.delete('/:id', authorize('student'), deleteFile);

module.exports = router;
