// routes/attendance.routes.js
const express = require('express');
const router = express.Router();

const attendanceSettings = require('../controllers/teacherControllers/attendanceSettings.controller');
const attendanceManagement = require('../controllers/teacherControllers/attendanceManagement.controller');
const attendanceController = require('../controllers/studentControllers/attendance.controller');
const attendanceAppeal = require('../controllers/studentControllers/attendanceAppeal.controller');
const immersionSchedule = require('../controllers/teacherControllers/immersionSchedule.controller');
const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');

// Batch-scoped attendance endpoints are shared by the SUPERVISOR (who owns
// attendance scheduling), the TEACHER assigned to the batch, and the
// COORDINATOR who created it. Fine-grained per-batch ownership is enforced
// inside the controllers via utils/batchAccess.
const BATCH_ROLES = ['teacher', 'supervisor', 'coordinator'];

// ----- Schedule + manual override -----
router.post('/teacher/batch/:batchId/open', authenticate, authorize(...BATCH_ROLES), attendanceSettings.openBatchAttendance);
router.post('/teacher/batch/:batchId/close', authenticate, authorize(...BATCH_ROLES), attendanceSettings.closeBatchAttendance);
router.get('/teacher/batch/:batchId/status', authenticate, authorize(...BATCH_ROLES), attendanceSettings.getBatchAttendanceStatus);
router.get('/teacher/batch/:batchId/config', authenticate, authorize(...BATCH_ROLES), attendanceSettings.getBatchConfig);
router.put('/teacher/batch/:batchId/config', authenticate, authorize(...BATCH_ROLES), attendanceSettings.updateBatchConfig);

// ----- Records, stats, appeals -----
router.get('/teacher/batch/:batchId/records', authenticate, authorize(...BATCH_ROLES), attendanceManagement.getBatchRecords);
router.get('/teacher/batch/:batchId/report', authenticate, authorize(...BATCH_ROLES), attendanceManagement.getBatchAttendanceReport);
router.get('/teacher/batch/:batchId/stats', authenticate, authorize(...BATCH_ROLES), attendanceManagement.getBatchStats);
router.get('/teacher/batch/:batchId/appeals', authenticate, authorize(...BATCH_ROLES), attendanceManagement.getBatchAppeals);
router.post('/teacher/appeals/:appealId/review', authenticate, authorize('teacher', 'coordinator'), attendanceManagement.reviewAppeal);

// ----- Work immersion schedules -----
router.get('/teacher/batch/:batchId/schedules', authenticate, authorize(...BATCH_ROLES), immersionSchedule.getBatchSchedules);
router.put('/teacher/batch/:batchId/schedules', authenticate, authorize(...BATCH_ROLES), immersionSchedule.upsertBatchSchedule);

// ----- Student: view own schedule -----
router.get('/student/schedule', authenticate, authorize('student'), immersionSchedule.getMySchedule);
router.get('/student/records', authenticate, authorize('student'), attendanceController.getMyAttendanceRecords);

// ----- Student: status, check-in/out, appeals -----
router.get('/student/status', authenticate, authorize('student'), attendanceController.getStudentAttendanceAccess);
router.post('/check-in', authenticate, authorize('student'), attendanceController.checkIn);
router.post('/check-out', authenticate, authorize('student'), attendanceController.checkOut);
router.post('/location-issue', authenticate, authorize('student'), attendanceController.reportLocationIssue);
router.post('/appeal', authenticate, authorize('student'), attendanceAppeal.upload.single('file'), attendanceAppeal.submitAppeal);
router.get('/appeals/me', authenticate, authorize('student'), attendanceAppeal.getMyAppeals);
router.delete('/appeals/:appealId', authenticate, authorize('student'), attendanceAppeal.deleteMyAppeal);

module.exports = router;
