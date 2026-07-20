const express = require('express');
const router = express.Router();

const supervisor = require('../controllers/supervisorControllers/supervisor.controller');
const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');

router.use(authenticate);

// Supervisor: their deployment batches and the students assigned to each.
router.get('/batches', authorize('supervisor'), supervisor.getSupervisorBatchStudents);
router.get('/batches/:requestId/attendance', authorize('supervisor'), supervisor.getBatchAttendance);

module.exports = router;
