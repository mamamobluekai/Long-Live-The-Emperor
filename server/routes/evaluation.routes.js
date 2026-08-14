const express = require('express');
const router = express.Router();
const evaluation = require('../controllers/evaluationControllers/evaluation.controller');
const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');

router.use(authenticate);

router.get('/criteria', evaluation.getCriteria);

router.put('/criteria', authorize('supervisor', 'coordinator', 'admin'), evaluation.saveCriteria);

router.post('/submit', authorize('supervisor'), evaluation.submitEvaluation);

router.get('/student/:studentId', authorize('supervisor', 'coordinator', 'teacher', 'admin'), evaluation.getStudentEvaluation);

router.get('/batch/:batchId', authorize('supervisor', 'coordinator', 'teacher', 'admin'), evaluation.listBatchEvaluations);

router.get('/my-students', authorize('supervisor'), evaluation.listMyStudents);

router.get('/me', authorize('student'), evaluation.getMyEvaluation);

router.get('/teacher/my-batch', authorize('teacher'), evaluation.getTeacherBatchEvaluations);

module.exports = router;
