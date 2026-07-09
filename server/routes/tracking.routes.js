// routes/trackingRoutes.js
const express = require("express");
const router = express.Router();

const attendanceController = require("../controllers/studentControllers/attendance.controller");
const locationController = require("../controllers/location.controller");
const authenticate = require("../middleware/verifyToken");
const authorize = require("../middleware/authorizeRole");

// --- Student actions ---
router.post("/attendance/check-in", authenticate, authorize("student"), attendanceController.checkIn);
router.post("/attendance/check-out",authenticate, authorize("student"), attendanceController.checkOut);
router.get("/attendance/today",authenticate,authorize("student"), attendanceController.getTodayStatus);
router.post("/attendance/location-issue",authenticate,authorize("student"), attendanceController.reportLocationIssue);
router.post("/location/update",authenticate, authorize("student"), locationController.updateLocation);

// --- Teacher/coordinator viewing ---
router.get(
  "/location/batch/:teacherBatchId",
  authenticate,
  authorize("teacher", "coordinator"),
  locationController.getBatchCurrentLocations
);
router.get(
  "/location/history/:studentId",
  authenticate,
  authorize("teacher", "coordinator"),
  locationController.getStudentLocationHistory
);

module.exports = router;