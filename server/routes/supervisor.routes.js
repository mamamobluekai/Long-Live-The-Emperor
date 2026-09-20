const express = require('express');
const router = express.Router();

const supervisor = require('../controllers/supervisorControllers/supervisor.controller');
const supervisorDashboard = require('../controllers/supervisorControllers/dashboard.controller');
const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');

router.use(authenticate);

router.get('/dashboard', authorize('supervisor'), supervisorDashboard.getSupervisorDashboard);

// Supervisor: their deployment batches and the students assigned to each.
router.get('/batches', authorize('supervisor'), supervisor.getSupervisorBatchStudents);
router.get('/batches/:requestId/attendance', authorize('supervisor'), supervisor.getBatchAttendance);
router.get('/reports-concerns', authorize('supervisor'), supervisor.getReportsConcerns);
router.post('/reports-concerns', authorize('supervisor'), supervisor.createReportConcern);

module.exports = router;
