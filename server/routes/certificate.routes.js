const express = require('express');
const router = express.Router();
const certificate = require('../controllers/certificateControllers/certificate.controller');
const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');

router.use(authenticate);

router.get('/eligible', authorize('supervisor'), certificate.getEligibleStudents);
router.get('/template/me', authorize('supervisor'), certificate.getMyCertificateTemplate);
router.put('/template/me', authorize('supervisor'), certificate.saveMyCertificateTemplate);
router.post('/generate/:studentId', authorize('supervisor'), certificate.generateCertificate);
router.post('/force/:studentId', authorize('supervisor'), certificate.forceGenerateCertificate);
router.get('/me', authorize('student'), certificate.getMyCertificate);
router.get('/me/download', authorize('student'), certificate.downloadMyCertificate);

module.exports = router;
