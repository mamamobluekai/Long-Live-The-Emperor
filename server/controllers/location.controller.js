// controllers/locationController.js
const pool = require("../db");
const { getIO } = require("../sockets");

// POST /api/location/update
// Called repeatedly by the student's browser (e.g. every 5-10s) while
// checked in. Only accepted if there's an active (checked_in) attendance
// row for today — this is what enforces "location only visible while
// clocked in."
// body: { latitude, longitude, accuracy }
exports.updateLocation = async (req, res) => {
  const userId = req.user.id;
  const { latitude, longitude, accuracy } = req.body;

  if (latitude == null || longitude == null) {
    return res.status(400).json({ message: "latitude and longitude are required." });
  }

  try {
    const studentRes = await pool.query(
      "SELECT id FROM students WHERE user_id = $1",
      [userId]
    );
    const student = studentRes.rows[0];
    if (!student) return res.status(404).json({ message: "Student profile not found." });

    const attendanceRes = await pool.query(
      `SELECT id, teacher_batch_id FROM student_attendance
       WHERE student_id = $1 AND date = CURRENT_DATE AND status = 'checked_in'`,
      [student.id]
    );
    const attendance = attendanceRes.rows[0];
    if (!attendance) {
      return res.status(403).json({ message: "Not checked in. Location will not be recorded." });
    }

    const locRes = await pool.query(
      `INSERT INTO student_locations (student_id, attendance_id, latitude, longitude, accuracy)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING recorded_at`,
      [student.id, attendance.id, latitude, longitude, accuracy || null]
    );

    // Push straight to the teacher's map, live
    getIO().to(`batch:${attendance.teacher_batch_id}`).emit("student:location_update", {
      studentId: student.id,
      latitude,
      longitude,
      accuracy,
      recordedAt: locRes.rows[0].recorded_at,
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("updateLocation error:", err);
    res.status(500).json({ message: "Failed to record location." });
  }
};

// GET /api/location/batch/:teacherBatchId
// Teacher dashboard: current position of every student currently checked in.
exports.getBatchCurrentLocations = async (req, res) => {
  const { teacherBatchId } = req.params;

  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (sl.student_id)
              sl.student_id, st.first_name, st.last_name,
              sl.latitude, sl.longitude, sl.accuracy, sl.recorded_at,
              sa.status, sa.check_in_time
       FROM student_locations sl
       JOIN student_attendance sa ON sa.id = sl.attendance_id
       JOIN students st ON st.id = sl.student_id
       WHERE sa.teacher_batch_id = $1 AND sa.date = CURRENT_DATE
       ORDER BY sl.student_id, sl.recorded_at DESC`,
      [teacherBatchId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("getBatchCurrentLocations error:", err);
    res.status(500).json({ message: "Failed to fetch locations." });
  }
};

// GET /api/location/history/:studentId?date=YYYY-MM-DD
// Trail of a single student's movement for a given day (defaults to today).
exports.getStudentLocationHistory = async (req, res) => {
  const { studentId } = req.params;
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const result = await pool.query(
      `SELECT sl.latitude, sl.longitude, sl.accuracy, sl.recorded_at
       FROM student_locations sl
       JOIN student_attendance sa ON sa.id = sl.attendance_id
       WHERE sl.student_id = $1 AND sa.date = $2
       ORDER BY sl.recorded_at ASC`,
      [studentId, date]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("getStudentLocationHistory error:", err);
    res.status(500).json({ message: "Failed to fetch location history." });
  }
};