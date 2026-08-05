const express = require('express');
const multer = require('multer');

const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');
const loginLimiter = require('../middleware/loginLimter');

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
  getLogs,
  getNotifications,
  markNotificationsRead,
  getReport,
  uploadLogo,
} = require('../controllers/adminContollers/admin.controller');

const { login, logout, profile, updateProfile } = require('../controllers/adminContollers/auth.controller');
const { dashboard } = require('../controllers/adminContollers/dashboard.controller');

const {
  uploadTeachersExcel,
  uploadSupervisorsExcel,
  uploadCoordinatorsExcel,
} = require('../controllers/adminContollers/upload.users.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const adminOnly = [authenticate, authorize('admin')];

router.post('/login', loginLimiter, login);

router.use(...adminOnly);

router.post('/logout', logout);
router.get('/profile', profile);
router.put('/profile', updateProfile);

router.patch('/profile/password', updatePassword);
router.post('/profile/picture', upload.single('photo'), uploadProfilePicture);

router.get('/dashboard', dashboard);

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
router.post('/settings/logo', upload.single('logo'), uploadLogo);

router.get('/logs', getLogs);

router.get('/notifications', getNotifications);
router.patch('/notifications/read', markNotificationsRead);

router.get('/reports/:type', getReport);

router.post('/admins', createAdmin);

router.post('/upload/teachers', upload.single('file'), uploadTeachersExcel);
router.post('/upload/supervisors', upload.single('file'), uploadSupervisorsExcel);
router.post('/upload/coordinators', upload.single('file'), uploadCoordinatorsExcel);

module.exports = router;
