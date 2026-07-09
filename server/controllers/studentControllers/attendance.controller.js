// controllers/attendanceController.js
const pool = require("../../db"); // your pg Pool instance
const { getIO } = require("../../sockets");

// Helper: find the active teacher_batch_id for a student.
// NOTE: teacher_batch_students.student_id stores the USER id (users.id),
// not the students profile id, so we must look the mapping up by userId.
async function getActiveBatchId(userId) {
  const result = await pool.query(
    `SELECT teacher_batch_id FROM teacher_batch_students
     WHERE student_id = $1
     ORDER BY assigned_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.teacher_batch_id || null;
}

// POST /api/attendance/check-in
// body: { latitude, longitude }
exports.checkIn = async (req, res) => {
  const userId = req.user.id; // from auth middleware
  const { latitude, longitude } = req.body;

  if (latitude == null || longitude == null) {
    return res.status(400).json({ message: "Location is required to check in." });
  }

  try {
    const studentRes = await pool.query(
      "SELECT id FROM students WHERE user_id = $1",
      [userId]
    );
    const student = studentRes.rows[0];
    if (!student) return res.status(404).json({ message: "Student profile not found." });

    const teacherBatchId = await getActiveBatchId(userId);
    if (!teacherBatchId) {
      return res.status(400).json({ message: "You are not assigned to a batch yet." });
    }

    // One attendance row per student per day (see UNIQUE constraint)
    const attendanceRes = await pool.query(
      `INSERT INTO student_attendance
        (student_id, teacher_batch_id, status, check_in_time, check_in_lat, check_in_lng)
       VALUES ($1, $2, 'checked_in', CURRENT_TIMESTAMP, $3, $4)
       ON CONFLICT (student_id, date)
       DO UPDATE SET
         status = 'checked_in',
         check_in_time = CURRENT_TIMESTAMP,
         check_in_lat = EXCLUDED.check_in_lat,
         check_in_lng = EXCLUDED.check_in_lng,
         check_out_time = NULL,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [student.id, teacherBatchId, latitude, longitude]
    );
    const attendance = attendanceRes.rows[0];

    // Log the first location point too, so the trail has a starting pin
    await pool.query(
      `INSERT INTO student_locations (student_id, attendance_id, latitude, longitude)
       VALUES ($1, $2, $3, $4)`,
      [student.id, attendance.id, latitude, longitude]
    );

    // Notify the teacher's room in real time
    getIO().to(`batch:${teacherBatchId}`).emit("student:checked_in", {
      studentId: student.id,
      attendanceId: attendance.id,
      latitude,
      longitude,
      time: attendance.check_in_time,
    });

    res.status(200).json({ message: "Checked in. Location sharing is now active.", attendance });
  } catch (err) {
    console.error("checkIn error:", err);
    res.status(500).json({ message: "Failed to check in." });
  }
};

// POST /api/attendance/check-out
// body: { latitude, longitude }
exports.checkOut = async (req, res) => {
  const userId = req.user.id;
  const { latitude, longitude } = req.body;

  try {
    const studentRes = await pool.query(
      "SELECT id FROM students WHERE user_id = $1",
      [userId]
    );
    const student = studentRes.rows[0];
    if (!student) return res.status(404).json({ message: "Student profile not found." });

    const attendanceRes = await pool.query(
      `UPDATE student_attendance
       SET status = 'checked_out',
           check_out_time = CURRENT_TIMESTAMP,
           check_out_lat = $2,
           check_out_lng = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE student_id = $1 AND date = CURRENT_DATE
       RETURNING *`,
      [student.id, latitude, longitude]
    );
    const attendance = attendanceRes.rows[0];
    if (!attendance) return res.status(400).json({ message: "No active check-in found for today." });

    getIO().to(`batch:${attendance.teacher_batch_id}`).emit("student:checked_out", {
      studentId: student.id,
      attendanceId: attendance.id,
      time: attendance.check_out_time,
    });

    res.status(200).json({ message: "Checked out. Location sharing stopped.", attendance });
  } catch (err) {
    console.error("checkOut error:", err);
    res.status(500).json({ message: "Failed to check out." });
  }
};

// POST /api/attendance/location-issue
// Called by the frontend when getCurrentPosition() fails during check-in
// (permission denied, GPS off, timeout, or unsupported browser).
// Lets the teacher see, in real time, who tried to check in but couldn't
// or wouldn't share their location.
// body: { issueType: 'permission_denied' | 'position_unavailable' | 'timeout' | 'unsupported' }
exports.reportLocationIssue = async (req, res) => {
  const userId = req.user.id;
  const { issueType } = req.body;

  const validTypes = ["permission_denied", "position_unavailable", "timeout", "unsupported"];
  if (!validTypes.includes(issueType)) {
    return res.status(400).json({ message: "Invalid issue type." });
  }

  try {
    const studentRes = await pool.query(
      `SELECT id, first_name, last_name FROM students WHERE user_id = $1`,
      [userId]
    );
    const student = studentRes.rows[0];
    if (!student) return res.status(404).json({ message: "Student profile not found." });

    const teacherBatchId = await getActiveBatchId(userId);
    if (!teacherBatchId) {
      return res.status(400).json({ message: "You are not assigned to a batch yet." });
    }

    await pool.query(
      `INSERT INTO location_issue_reports (student_id, teacher_batch_id, issue_type)
       VALUES ($1, $2, $3)`,
      [student.id, teacherBatchId, issueType]
    );

    // Real-time alert to the teacher watching this batch
    getIO().to(`batch:${teacherBatchId}`).emit("student:location_issue", {
      studentId: student.id,
      firstName: student.first_name,
      lastName: student.last_name,
      issueType,
      reportedAt: new Date().toISOString(),
    });

    res.status(200).json({ message: "Issue reported." });
  } catch (err) {
    console.error("reportLocationIssue error:", err);
    res.status(500).json({ message: "Failed to report location issue." });
  }
};

// GET /api/attendance/today
exports.getTodayStatus = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT sa.* FROM student_attendance sa
       JOIN students s ON s.id = sa.student_id
       WHERE s.user_id = $1 AND sa.date = CURRENT_DATE`,
      [userId]
    );
    res.json(result.rows[0] || { status: "not_checked_in" });
  } catch (err) {
    console.error("getTodayStatus error:", err);
    res.status(500).json({ message: "Failed to fetch attendance status." });
  }
};