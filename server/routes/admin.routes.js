const express = require('express');
const multer = require('multer');

const {
  getAllUsers,
  getCoordinators,
  getUsersByStatus,
  approveStaff,
  disapproveStaff,
  deleteUser,
} = require('../controllers/adminContollers/admin.controller');

const {
  uploadTeachersExcel,
  uploadSupervisorsExcel,
  uploadCoordinatorsExcel,
} = require('../controllers/adminContollers/upload.users.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/users', getAllUsers);
router.get('/coordinators', getCoordinators);
router.get('/users/status/:status', getUsersByStatus);
router.put('/staff/:id/approve', approveStaff);
router.put('/staff/:id/disapprove', disapproveStaff);
router.delete('/users/:id', deleteUser);

router.post('/upload/teachers', upload.single('file'), uploadTeachersExcel);
router.post('/upload/supervisors', upload.single('file'), uploadSupervisorsExcel);
router.post('/upload/coordinators', upload.single('file'), uploadCoordinatorsExcel);

module.exports = router;

