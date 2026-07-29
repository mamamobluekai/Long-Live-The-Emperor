const express = require('express');
const router = express.Router();
const certificate = require('../controllers/certificateControllers/certificate.controller');
const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');

router.use(authenticate);

router.get('/eligible', authorize('supervisor', 'admin'), certificate.getEligibleStudents);
router.get('/template/me', authenticate, certificate.getMyCertificateTemplate);
router.put('/template/me', authenticate, certificate.saveMyCertificateTemplate);
router.post('/generate/:studentId', authorize('supervisor', 'admin'), certificate.generateCertificate);
router.post('/force/:studentId', authorize('supervisor', 'admin'), certificate.forceGenerateCertificate);
router.delete('/undo/:studentId', authorize('supervisor', 'admin'), certificate.undoForceIssue);
router.get('/me', authorize('student', 'admin'), certificate.getMyCertificate);
router.get('/me/download', authorize('student'), certificate.downloadMyCertificate);

module.exports = router;
