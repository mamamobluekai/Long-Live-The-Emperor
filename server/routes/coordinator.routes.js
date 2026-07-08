const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const {
  getPendingStudents,
  approveStudent,
  disapproveStudent,
  upsertRequirements,
  submitRequirements,
  getRequirements,
  uploadDocument,
  deleteDocument,
  listSubmissions,
  reviewSubmission,
  verifyDocument,
  createTeacherBatch,
  updateTeacherBatch,
  deleteTeacherBatch,
  assignApprovedStudentsToBatch,
  getMyTeacherBatches,
  getTeacherBatchStudents,
  getTeachersListForCoordinator,
  getSupervisorsListForCoordinator,
  getCoordinatorsForSupervisor,
  getCoordinatorBatchesWithAssignedStudents,
  getRequirementCompletedStudentsForCoordinator,
  createSupervisorRequest,
  createDeploymentRequest,
  getMyDeploymentRequests,
  getSupervisorDeploymentRequests,
  getDeploymentRequestStudents,
  approveDeploymentRequest,
  rejectDeploymentRequest,
  deleteDeploymentRequest,
  fulfillSupervisorRequest,
} = require('../controllers/coordinatorControllers');
const { uploadStudentsExcel } = require('../controllers/coordinatorControllers/uploadStudents.controller');

const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');

const router = express.Router();
const uploadsDir = path.join(__dirname, '../uploads/requirements');
fs.mkdirSync(uploadsDir, { recursive: true });
const uploadExcel = multer({ storage: multer.memoryStorage() });
const uploadDoc = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate);

router.get('/students/pending', authorize('coordinator', 'admin'), getPendingStudents);
router.post('/students/upload', authorize('coordinator', 'admin'), uploadExcel.single('file'), uploadStudentsExcel);
router.put('/students/:id/approve', authorize('coordinator', 'admin'), approveStudent);
router.put('/students/:id/disapprove', authorize('coordinator', 'admin'), disapproveStudent);

router.put('/requirements', authorize('student', 'coordinator', 'admin'), upsertRequirements);
router.post('/requirements/submit', authorize('student', 'coordinator', 'admin'), submitRequirements);
router.get('/requirements/:studentId', authorize('student', 'coordinator', 'admin'), getRequirements);
router.post('/documents/upload', authorize('student', 'coordinator', 'admin'), uploadDoc.single('file'), uploadDocument);
router.delete('/documents/:id', authorize('student', 'coordinator', 'admin'), deleteDocument);

router.get('/submissions', authorize('coordinator', 'admin'), listSubmissions);
router.post('/submissions/:id/review', authorize('coordinator', 'admin'), reviewSubmission);
router.put('/documents/:id/verify', authorize('coordinator', 'admin'), verifyDocument);

router.post('/teacher-batches', authorize('coordinator', 'admin'), createTeacherBatch);
router.put('/teacher-batches/:batchId', authorize('coordinator', 'admin'), updateTeacherBatch);
router.delete('/teacher-batches/:batchId', authorize('coordinator', 'admin'), deleteTeacherBatch);
router.post('/teacher-batches/:batchId/assign', authorize('coordinator', 'admin'), assignApprovedStudentsToBatch);
router.get('/teacher-batches/me', authorize('teacher', 'coordinator', 'admin'), getMyTeacherBatches);
router.get('/teacher-batches/:batchId/students', authorize('teacher', 'coordinator', 'admin'), getTeacherBatchStudents);
router.get('/teachers', authorize('coordinator', 'admin'), getTeachersListForCoordinator);
router.get('/supervisors', authorize('coordinator', 'admin'), getSupervisorsListForCoordinator);
router.get('/coordinators', authorize('supervisor', 'coordinator', 'admin'), getCoordinatorsForSupervisor);
router.get('/batches/assigned', authorize('coordinator', 'admin'), getCoordinatorBatchesWithAssignedStudents);
router.get('/students/completed', authorize('coordinator', 'admin'), getRequirementCompletedStudentsForCoordinator);

router.post('/supervisor-requests', authorize('supervisor', 'coordinator', 'admin'), createSupervisorRequest);
router.post('/deployment-requests', authorize('coordinator', 'admin'), createDeploymentRequest);
router.get('/deployment-requests/me', authorize('coordinator', 'admin'), getMyDeploymentRequests);
router.get('/deployment-requests/supervisor', authorize('supervisor', 'coordinator', 'admin'), getSupervisorDeploymentRequests);
router.get('/deployment-requests/:requestId/students', authorize('coordinator', 'supervisor', 'admin'), getDeploymentRequestStudents);
router.put('/deployment-requests/:requestId/approve', authorize('supervisor', 'coordinator', 'admin'), approveDeploymentRequest);
router.put('/deployment-requests/:requestId/reject', authorize('supervisor', 'coordinator', 'admin'), rejectDeploymentRequest);
router.delete('/deployment-requests/:requestId', authorize('coordinator', 'admin'), deleteDeploymentRequest);
router.post('/deployment-requests/:requestId/fulfill', authorize('coordinator', 'admin'), fulfillSupervisorRequest);

module.exports = router;
