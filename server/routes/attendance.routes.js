// routes/attendance.routes.js
const express = require('express');
const router = express.Router();

const attendanceSettings = require('../controllers/teacherControllers/attendanceSettings.controller');
const attendanceManagement = require('../controllers/teacherControllers/attendanceManagement.controller');
const attendanceController = require('../controllers/studentControllers/attendance.controller');
const attendanceAppeal = require('../controllers/studentControllers/attendanceAppeal.controller');
const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');

// ----- Teacher / coordinator: schedule + manual override -----
router.post('/teacher/batch/:batchId/open', authenticate, authorize('teacher', 'coordinator'), attendanceSettings.openBatchAttendance);
router.post('/teacher/batch/:batchId/close', authenticate, authorize('teacher', 'coordinator'), attendanceSettings.closeBatchAttendance);
router.get('/teacher/batch/:batchId/status', authenticate, authorize('teacher', 'coordinator'), attendanceSettings.getBatchAttendanceStatus);
router.get('/teacher/batch/:batchId/config', authenticate, authorize('teacher', 'coordinator'), attendanceSettings.getBatchConfig);
router.put('/teacher/batch/:batchId/config', authenticate, authorize('teacher', 'coordinator'), attendanceSettings.updateBatchConfig);

// ----- Teacher: records, stats, appeals -----
router.get('/teacher/batch/:batchId/records', authenticate, authorize('teacher', 'coordinator'), attendanceManagement.getBatchRecords);
router.get('/teacher/batch/:batchId/stats', authenticate, authorize('teacher', 'coordinator'), attendanceManagement.getBatchStats);
router.get('/teacher/batch/:batchId/appeals', authenticate, authorize('teacher', 'coordinator'), attendanceManagement.getBatchAppeals);
router.post('/teacher/appeals/:appealId/review', authenticate, authorize('teacher', 'coordinator'), attendanceManagement.reviewAppeal);

// ----- Student: status, check-in/out, appeals -----
router.get('/student/status', authenticate, authorize('student'), attendanceController.getStudentAttendanceAccess);
router.post('/check-in', authenticate, authorize('student'), attendanceController.checkIn);
router.post('/check-out', authenticate, authorize('student'), attendanceController.checkOut);
router.post('/location-issue', authenticate, authorize('student'), attendanceController.reportLocationIssue);
router.post('/appeal', authenticate, authorize('student'), attendanceAppeal.upload.single('file'), attendanceAppeal.submitAppeal);
router.get('/appeals/me', authenticate, authorize('student'), attendanceAppeal.getMyAppeals);

module.exports = router;
