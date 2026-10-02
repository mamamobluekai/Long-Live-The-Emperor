const express = require('express');
const multer = require('multer');

const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');
const loginLimiter = require('../middleware/loginLimter');
const { authLimiter, credentialLimiter, uploadLimiter } = require('../middleware/rateLimiters');
const { uploadGuard } = require('../middleware/uploadGuard');

const {
  getAllUsers,
  getCoordinators,
  getUsersByStatus,
  createAdmin,
  approveStaff,
  disapproveStaff,
  deleteUser,
  getUserById,
  updateUser,
  updateUserStatus,
  resetUserPassword,
  updatePassword,
  uploadProfilePicture,
  listPendingCoordinators,
  approveCoordinator,
  rejectCoordinator,
  getSettings,
  updateSettings,
  setMaintenanceMode,
  getLogs,
  deleteLog,
  deleteLogs,
  deleteAllLogs,
  getNotifications,
  markNotificationsRead,
  deleteNotification,
  deleteAllNotifications,
  getReport,
  uploadLogo,
  getImmersionPeriods,
  createImmersionPeriod,
  updateImmersionPeriod,
  deleteImmersionPeriod,
  getImmersionAccess,
  previewPeriodArchive,
  archivePeriod,
  listArchivePeriods,
  getArchivePeriod,
} = require('../controllers/adminContollers/admin.controller');

const { login, logout, profile, updateProfile } = require('../controllers/adminContollers/auth.controller');
const { dashboard, periodAnalytics } = require('../controllers/adminContollers/dashboard.controller');

const {
  uploadTeachersExcel,
  uploadSupervisorsExcel,
  uploadCoordinatorsExcel,
  downloadUploadTemplate,
} = require('../controllers/adminContollers/upload.users.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const adminOnly = [authenticate, authorize('admin')];

router.post('/login', authLimiter, credentialLimiter, loginLimiter, login);

router.use(...adminOnly);

router.post('/logout', logout);
router.get('/profile', profile);
router.put('/profile', updateProfile);

router.patch('/profile/password', updatePassword);
router.post('/profile/picture', uploadLimiter, upload.single('photo'), uploadGuard(['image']), uploadProfilePicture);

router.get('/dashboard', dashboard);
router.get('/dashboard/period-analytics', periodAnalytics);

router.get('/users', getAllUsers);
router.get('/users/status/:status', getUsersByStatus);
router.get('/users/:id', getUserById);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.patch('/users/:id/status', updateUserStatus);
router.patch('/users/:id/reset-password', resetUserPassword);

router.get('/coordinators', getCoordinators);
router.get('/coordinators/pending', listPendingCoordinators);
router.patch('/coordinators/:id/approve', approveCoordinator);
router.patch('/coordinators/:id/reject', rejectCoordinator);

router.put('/staff/:id/approve', approveStaff);
router.put('/staff/:id/disapprove', disapproveStaff);

router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.put('/settings/maintenance', setMaintenanceMode);
router.post('/settings/logo', uploadLimiter, upload.single('logo'), uploadGuard(['image']), uploadLogo);

router.get('/logs', getLogs);
router.delete('/logs/all', deleteAllLogs);
router.delete('/logs/bulk', deleteLogs);
router.delete('/logs/:id', deleteLog);

router.get('/notifications', getNotifications);
router.patch('/notifications/read', markNotificationsRead);
router.delete('/notifications', deleteAllNotifications);
router.delete('/notifications/:id', deleteNotification);

router.get('/reports/:type', getReport);

router.post('/admins', createAdmin);

router.get('/immersion/periods', getImmersionPeriods);
router.post('/immersion/periods', createImmersionPeriod);
router.put('/immersion/periods/:id', updateImmersionPeriod);
router.delete('/immersion/periods/:id', deleteImmersionPeriod);
router.get('/immersion/access', getImmersionAccess);

router.get('/immersion/periods/:periodId/archive-preview', previewPeriodArchive);
router.post('/immersion/periods/:periodId/archive', archivePeriod);
router.get('/archives', listArchivePeriods);
router.get('/archives/:archiveId', getArchivePeriod);

router.get('/upload/template/:type', downloadUploadTemplate);

router.post('/upload/teachers', uploadLimiter, upload.single('file'), uploadGuard(['spreadsheet']), uploadTeachersExcel);
router.post('/upload/supervisors', uploadLimiter, upload.single('file'), uploadGuard(['spreadsheet']), uploadSupervisorsExcel);
router.post('/upload/coordinators', uploadLimiter, upload.single('file'), uploadGuard(['spreadsheet']), uploadCoordinatorsExcel);

module.exports = router;
