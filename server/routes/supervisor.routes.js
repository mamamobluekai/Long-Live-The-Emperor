const express = require('express');
const router = express.Router();

const supervisor = require('../controllers/supervisorControllers/supervisor.controller');
const supervisorDashboard = require('../controllers/supervisorControllers/dashboard.controller');
const immersionExclusions = require('../controllers/supervisorControllers/immersionExclusions.controller');
const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');

router.use(authenticate);

router.get('/dashboard', authorize('supervisor'), supervisorDashboard.getSupervisorDashboard);

// Supervisor: their deployment batches and the students assigned to each.
router.get('/batches', authorize('supervisor'), supervisor.getSupervisorBatchStudents);
router.get('/batches/:requestId/attendance', authorize('supervisor'), supervisor.getBatchAttendance);

// Per-student progress (requirements, attendance, daily documentation).
// The controller scopes the student to the calling supervisor.
router.get(
  '/students/:studentId/progress',
  authorize('supervisor'),
  supervisor.getStudentProgress
);
// ----- Blocked immersion dates & Philippine holidays -----
// A supervisor can block a date for a batch (e.g. a school event) so it is not
// counted as an immersion day, even on a Mon-Fri. Holidays are excluded
// everywhere by the shared day builder in server/utils/immersionDays.js.
router.get(
  '/batches/:batchId/blocked-dates',
  authorize('supervisor'),
  immersionExclusions.getBlockedDates
);
router.post(
  '/batches/:batchId/blocked-dates',
  authorize('supervisor'),
  immersionExclusions.addBlockedDate
);
router.delete(
  '/blocked-dates/:id',
  authorize('supervisor'),
  immersionExclusions.removeBlockedDate
);
router.get('/holidays', authorize('supervisor'), immersionExclusions.getHolidays);
router.post('/holidays', authorize('supervisor'), immersionExclusions.addHoliday);
router.delete('/holidays/:id', authorize('supervisor'), immersionExclusions.removeHoliday);

router.get('/reports-concerns', authorize('supervisor'), supervisor.getReportsConcerns);
router.post('/reports-concerns', authorize('supervisor'), supervisor.createReportConcern);
router.delete('/reports-concerns/:id', authorize('supervisor'), supervisor.deleteReportConcern);

module.exports = router;
