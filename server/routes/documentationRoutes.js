const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');
const {
  getStudentDailyDocs,
  submitDailyDoc,
  gradeDailyDoc,
  getDocumentationCriteria,
  saveDocumentationCriteria,
  getBatchDailyDocSummary,
  ensureDocumentationTables,
} = require('../controllers/documentationController');

router.use(authenticate);

router.get('/daily', authorize('teacher', 'coordinator', 'admin', 'student'), getStudentDailyDocs);
router.post('/daily/submit', authorize('student'), submitDailyDoc);
router.post('/daily/:docId/grade', authorize('teacher', 'coordinator', 'admin'), gradeDailyDoc);
router.get('/criteria', authorize('teacher', 'coordinator', 'admin', 'student'), getDocumentationCriteria);
router.put('/criteria', authorize('teacher', 'coordinator', 'admin'), saveDocumentationCriteria);
router.get('/batch/:batchId/summary', authorize('teacher', 'coordinator', 'admin'), getBatchDailyDocSummary);

module.exports = router;
