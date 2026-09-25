const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const {
  getPendingStudents,
  getStudentStrands,
  approveStudent,
  disapproveStudent,
  deleteStudent,
  bulkApproveStudents,
  bulkDisapproveStudents,
  bulkDeleteStudents,
  upsertRequirements,
  submitRequirements,
  getRequirements,
  uploadDocument,
  deleteDocument,
  listSubmissions,
  reviewSubmission,
  verifyDocument,
  listDocumentTypes,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
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
  getCoordinatorDashboard,
} = require('../controllers/coordinatorControllers');
const { getTeacherReportsConcerns, confirmReportConcern } = require('../controllers/supervisorControllers/supervisor.controller');
const { uploadStudentsExcel } = require('../controllers/coordinatorControllers/uploadStudents.controller');

const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');

const router = express.Router();
const uploadsDir = path.join(__dirname, '../uploads/requirements');
fs.mkdirSync(uploadsDir, { recursive: true });
const uploadExcel = multer({ storage: multer.memoryStorage() });
const uploadDoc = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate);

router.get('/dashboard', authorize('coordinator', 'admin'), getCoordinatorDashboard);

router.get('/students/pending', authorize('coordinator', 'admin'), getPendingStudents);
router.get('/students/strands', authorize('coordinator', 'admin'), getStudentStrands);
router.post('/students/upload', authorize('coordinator', 'admin'), uploadExcel.single('file'), uploadStudentsExcel);
router.put('/students/:id/approve', authorize('coordinator', 'admin'), approveStudent);
router.put('/students/:id/disapprove', authorize('coordinator', 'admin'), disapproveStudent);
router.delete('/students/:id', authorize('coordinator', 'admin'), deleteStudent);
router.put('/students/bulk/approve', authorize('coordinator', 'admin'), bulkApproveStudents);
router.put('/students/bulk/disapprove', authorize('coordinator', 'admin'), bulkDisapproveStudents);
router.delete('/students/bulk', authorize('coordinator', 'admin'), bulkDeleteStudents);

router.put('/requirements', authorize('student', 'coordinator', 'admin'), upsertRequirements);
router.post('/requirements/submit', authorize('student', 'coordinator', 'admin'), submitRequirements);
router.get('/requirements/:studentId', authorize('student', 'coordinator', 'admin'), getRequirements);
router.post('/documents/upload', authorize('student', 'coordinator', 'admin'), uploadDoc.single('file'), uploadDocument);
router.delete('/documents/:id', authorize('student', 'coordinator', 'admin'), deleteDocument);

router.get('/submissions', authorize('coordinator', 'admin'), listSubmissions);
router.post('/submissions/:id/review', authorize('coordinator', 'admin'), reviewSubmission);
router.put('/documents/:id/verify', authorize('coordinator', 'admin'), verifyDocument);

router.get('/document-types', authorize('student', 'coordinator', 'admin', 'teacher', 'supervisor'), listDocumentTypes);
router.post('/document-types', authorize('coordinator', 'admin'), createDocumentType);
router.put('/document-types/:id', authorize('coordinator', 'admin'), updateDocumentType);
router.delete('/document-types/:id', authorize('coordinator', 'admin'), deleteDocumentType);

router.post('/teacher-batches', authorize('coordinator', 'admin'), createTeacherBatch);
router.put('/teacher-batches/:batchId', authorize('coordinator', 'admin'), updateTeacherBatch);
router.delete('/teacher-batches/:batchId', authorize('coordinator', 'admin'), deleteTeacherBatch);
router.post('/teacher-batches/:batchId/assign', authorize('coordinator', 'admin'), assignApprovedStudentsToBatch);
router.get('/teacher-batches/me', authorize('teacher', 'coordinator', 'admin'), getMyTeacherBatches);
router.get('/teacher-batches/:batchId/students', authorize('teacher', 'coordinator', 'admin'), getTeacherBatchStudents);
router.get('/teacher/reports-concerns', authorize('teacher', 'coordinator', 'admin'), getTeacherReportsConcerns);
router.patch('/teacher/reports-concerns/:reportId/confirm', authorize('teacher', 'coordinator', 'admin'), confirmReportConcern);
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
