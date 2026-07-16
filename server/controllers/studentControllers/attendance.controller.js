// Student attendance actions: time in / time out, with GPS capture, gating,
// and real-time Socket.IO broadcasts. Scheduling is resolved in Asia/Manila.
const pool = require('../../db');
const { getIO } = require('../../sockets');
const { resolveAttendanceState } = require('../teacherControllers/attendanceSettings.controller');

// Find the student's currently assigned batch (teacher_batch_students stores user id).
async function getActiveBatch(userId) {
  const r = await pool.query(
    `SELECT tbs.teacher_batch_id, tb.teacher_id
     FROM teacher_batch_students tbs
     JOIN teacher_batches tb ON tb.id = tbs.teacher_batch_id
     WHERE tbs.student_id = $1
     ORDER BY tbs.assigned_at DESC LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

async function getStudentRow(userId) {
  const r = await pool.query(
    'SELECT id, first_name, last_name, student_number FROM students WHERE user_id = $1',
    [userId]
  );
  return r.rows[0];
}

function studentName(s) {
  return `${s.first_name} ${s.last_name}`.trim();
}

// Record a GPS snapshot for an attendance event.
async function logGps({ student, teacherBatchId, attendanceId, eventType, latitude, longitude, accuracy }) {
  await pool.query(
    `INSERT INTO gps_logs (student_id, teacher_batch_id, attendance_id, event_type, latitude, longitude, accuracy, student_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [student.id, teacherBatchId, attendanceId, eventType, latitude, longitude, accuracy || null, studentName(student)]
  );
}

// Verify the window for a given type is open right now (or teacher override).
async function assertTypeOpen(teacherBatchId, type) {
  const state = await resolveAttendanceState(teacherBatchId);
  if (!state || !state.attendance_open) {
    const err = new Error(
      type === 'time_in'
        ? 'Time In is closed right now. Wait for the 8:00 AM window or your teacher to open it.'
        : 'Time Out is closed right now. Wait for the 5:00 PM window or your teacher to open it.'
    );
    err.status = 403;
    throw err;
  }
  if (!state.manual_open && state.active_type && state.active_type !== type) {
    const err = new Error(
      type === 'time_in'
        ? 'Time In is not open yet. The Time In window is 8:00 AM – 8:30 AM.'
        : 'Time Out is not open yet. The Time Out window is 5:00 PM – 5:30 PM.'
    );
    err.status = 403;
    throw err;
  }
  return state;
}

// POST /api/attendance/check-in  { latitude, longitude, accuracy }
exports.checkIn = async (req, res) => {
  const userId = req.user.id;
  const { latitude, longitude, accuracy } = req.body;

  if (latitude == null || longitude == null) {
    return res.status(400).json({ message: 'Location is required to time in.' });
  }

  const client = await pool.connect();
  try {
    const student = await getStudentRow(userId);
    if (!student) return res.status(404).json({ message: 'Student profile not found.' });

    const batch = await getActiveBatch(userId);
    if (!batch) return res.status(400).json({ message: 'You are not assigned to a batch yet.' });

    await assertTypeOpen(batch.teacher_batch_id, 'time_in');

    // Prevent duplicate Time In for today.
    const existing = await client.query(
      `SELECT id, check_in_time FROM student_attendance WHERE student_id = $1 AND date = CURRENT_DATE`,
      [student.id]
    );
    if (existing.rows[0]?.check_in_time) {
      return res.status(409).json({ message: 'You have already timed in today.', attendance: existing.rows[0] });
    }

    const attendanceRes = await client.query(
      `INSERT INTO student_attendance
        (student_id, teacher_batch_id, status, check_in_time, check_in_lat, check_in_lng, check_in_accuracy)
       VALUES ($1, $2, 'checked_in', CURRENT_TIMESTAMP, $3, $4, $5)
       ON CONFLICT (student_id, date)
       DO UPDATE SET status = 'checked_in',
         check_in_time = CURRENT_TIMESTAMP,
         check_in_lat = EXCLUDED.check_in_lat,
         check_in_lng = EXCLUDED.check_in_lng,
         check_in_accuracy = EXCLUDED.check_in_accuracy,
         check_out_time = NULL,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [student.id, batch.teacher_batch_id, latitude, longitude, accuracy || null]
    );
    const attendance = attendanceRes.rows[0];

    await logGps({
      student, teacherBatchId: batch.teacher_batch_id, attendanceId: attendance.id,
      eventType: 'check_in', latitude, longitude, accuracy,
    });

    getIO().to(`batch:${batch.teacher_batch_id}`).emit('student:checked_in', {
      studentId: student.id,
      attendanceId: attendance.id,
      studentName: studentName(student),
      studentNumber: student.student_number,
      latitude, longitude, accuracy,
      time: attendance.check_in_time,
    });

    res.status(200).json({
      message: 'Timed in successfully. Your location is now shared with your teacher.',
      attendance, teacherBatchId: batch.teacher_batch_id,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('checkIn error:', err);
    res.status(500).json({ message: 'Failed to time in.' });
  } finally {
    client.release();
  }
};

// POST /api/attendance/check-out  { latitude, longitude, accuracy }
exports.checkOut = async (req, res) => {
  const userId = req.user.id;
  const { latitude, longitude, accuracy } = req.body;

  const client = await pool.connect();
  try {
    const student = await getStudentRow(userId);
    if (!student) return res.status(404).json({ message: 'Student profile not found.' });

    const batch = await getActiveBatch(userId);
    if (!batch) return res.status(400).json({ message: 'You are not assigned to a batch yet.' });

    await assertTypeOpen(batch.teacher_batch_id, 'time_out');

    const existing = await client.query(
      `SELECT id, check_in_time, check_out_time FROM student_attendance WHERE student_id = $1 AND date = CURRENT_DATE`,
      [student.id]
    );
    if (!existing.rows[0]) {
      return res.status(400).json({ message: 'You have not timed in yet today.' });
    }
    if (existing.rows[0].check_out_time) {
      return res.status(409).json({ message: 'You have already timed out today.', attendance: existing.rows[0] });
    }

    const attendanceRes = await client.query(
      `UPDATE student_attendance
       SET status = 'checked_out',
           check_out_time = CURRENT_TIMESTAMP,
           check_out_lat = $2,
           check_out_lng = $3,
           check_out_accuracy = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE student_id = $1 AND date = CURRENT_DATE
       RETURNING *`,
      [student.id, latitude, longitude, accuracy || null]
    );
    const attendance = attendanceRes.rows[0];

    await logGps({
      student, teacherBatchId: batch.teacher_batch_id, attendanceId: attendance.id,
      eventType: 'check_out', latitude, longitude, accuracy,
    });

    getIO().to(`batch:${batch.teacher_batch_id}`).emit('student:checked_out', {
      studentId: student.id,
      attendanceId: attendance.id,
      studentName: studentName(student),
      studentNumber: student.student_number,
      time: attendance.check_out_time,
    });

    res.status(200).json({ message: 'Timed out successfully. Location sharing stopped.', attendance });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('checkOut error:', err);
    res.status(500).json({ message: 'Failed to time out.' });
  } finally {
    client.release();
  }
};

// POST /api/attendance/location-issue  { issueType }
exports.reportLocationIssue = async (req, res) => {
  const userId = req.user.id;
  const { issueType } = req.body;
  const validTypes = ['permission_denied', 'position_unavailable', 'timeout', 'unsupported'];
  if (!validTypes.includes(issueType)) return res.status(400).json({ message: 'Invalid issue type.' });

  try {
    const student = await getStudentRow(userId);
    if (!student) return res.status(404).json({ message: 'Student profile not found.' });
    const batch = await getActiveBatch(userId);
    if (!batch) return res.status(400).json({ message: 'You are not assigned to a batch yet.' });

    getIO().to(`batch:${batch.teacher_batch_id}`).emit('student:location_issue', {
      studentId: student.id,
      firstName: student.first_name, lastName: student.last_name,
      issueType, reportedAt: new Date().toISOString(),
    });
    res.status(200).json({ message: 'Issue reported.' });
  } catch (err) {
    console.error('reportLocationIssue error:', err);
    res.status(500).json({ message: 'Failed to report location issue.' });
  }
};

// GET /api/attendance/student/status  -> phase + open state + schedule + today record
exports.getStudentAttendanceAccess = async (req, res) => {
  const userId = req.user.id;
  try {
    const student = await getStudentRow(userId);
    if (!student) return res.status(404).json({ message: 'Student profile not found.' });
    const batch = await getActiveBatch(userId);
    if (!batch) return res.json({ assigned: false, attendance_open: false });

    const state = await resolveAttendanceState(batch.teacher_batch_id);

    const rec = await pool.query(
      `SELECT id, status, check_in_time, check_out_time, appeal_time_in_id, appeal_time_out_id
       FROM student_attendance WHERE student_id = $1 AND date = CURRENT_DATE`,
      [student.id]
    );

    res.json({
      assigned: true,
      teacherBatchId: batch.teacher_batch_id,
      teacherId: batch.teacher_id,
      ...state,
      today: rec.rows[0] || null,
    });
  } catch (err) {
    console.error('getStudentAttendanceAccess error:', err);
    res.status(500).json({ message: 'Failed to fetch attendance access.' });
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
    res.json(result.rows[0] || { status: 'not_checked_in' });
  } catch (err) {
    console.error('getTodayStatus error:', err);
    res.status(500).json({ message: 'Failed to fetch attendance status.' });
  }
};
