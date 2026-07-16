// Teacher-facing attendance management: records, statistics, and appeals.
const pool = require('../../db/');

// Ensure the requesting teacher owns the batch.
async function assertOwnsBatch(teacherUserId, batchId) {
  const teacherRow = await pool.query('SELECT id FROM teachers WHERE user_id = $1', [teacherUserId]);
  const teacherId = teacherRow.rows[0]?.id;
  if (!teacherId) return { error: 'Teacher profile not found.', status: 400 };
  const own = await pool.query('SELECT id FROM teacher_batches WHERE id = $1 AND teacher_id = $2', [batchId, teacherId]);
  if (own.rows.length === 0) return { error: 'Access denied.', status: 403 };
  return { teacherId };
}

// GET /api/attendance/teacher/batch/:batchId/records?date=YYYY-MM-DD
const getBatchRecords = async (req, res) => {
  try {
    const { batchId } = req.params;
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const own = await assertOwnsBatch(req.user.id, batchId);
    if (own.error) return res.status(own.status).json({ error: own.error });

    const result = await pool.query(
      `SELECT sa.id, sa.student_id, sa.date, sa.status,
              sa.check_in_time, sa.check_in_lat, sa.check_in_lng, sa.check_in_accuracy,
              sa.check_out_time, sa.check_out_lat, sa.check_out_lng, sa.check_out_accuracy,
              sa.appeal_time_in_id, sa.appeal_time_out_id,
              s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand,
              s.photo_url, u.email
       FROM student_attendance sa
       JOIN students s ON s.id = sa.student_id
       JOIN users u ON u.id = s.user_id
       WHERE sa.teacher_batch_id = $1 AND sa.date = $2
       ORDER BY s.last_name ASC, s.first_name ASC`,
      [batchId, date]
    );
    res.json({ date, records: result.rows });
  } catch (err) {
    console.error('getBatchRecords error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// GET /api/attendance/teacher/batch/:batchId/stats?date=YYYY-MM-DD
const getBatchStats = async (req, res) => {
  try {
    const { batchId } = req.params;
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const own = await assertOwnsBatch(req.user.id, batchId);
    if (own.error) return res.status(own.status).json({ error: own.error });

    const total = await pool.query(
      'SELECT COUNT(*)::int AS n FROM teacher_batch_students WHERE teacher_batch_id = $1',
      [batchId]
    );
    const timedIn = await pool.query(
      `SELECT COUNT(*)::int AS n FROM student_attendance
       WHERE teacher_batch_id = $1 AND date = $2 AND check_in_time IS NOT NULL`,
      [batchId, date]
    );
    const timedOut = await pool.query(
      `SELECT COUNT(*)::int AS n FROM student_attendance
       WHERE teacher_batch_id = $1 AND date = $2 AND check_out_time IS NOT NULL`,
      [batchId, date]
    );
    const pendingAppeals = await pool.query(
      `SELECT COUNT(*)::int AS n FROM attendance_appeals a
       JOIN teacher_batches tb ON tb.id = a.teacher_batch_id
       JOIN teachers t ON t.id = tb.teacher_id
       WHERE tb.id = $1 AND a.status = 'pending'`,
      [batchId]
    );

    res.json({
      date,
      total_students: total.rows[0].n,
      timed_in: timedIn.rows[0].n,
      timed_out: timedOut.rows[0].n,
      pending_appeals: pendingAppeals.rows[0].n,
      timed_in_rate: total.rows[0].n ? Math.round((timedIn.rows[0].n / total.rows[0].n) * 100) : 0,
      timed_out_rate: total.rows[0].n ? Math.round((timedOut.rows[0].n / total.rows[0].n) * 100) : 0,
    });
  } catch (err) {
    console.error('getBatchStats error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// GET /api/attendance/teacher/batch/:batchId/appeals?status=pending
const getBatchAppeals = async (req, res) => {
  try {
    const { batchId } = req.params;
    const status = req.query.status;
    const own = await assertOwnsBatch(req.user.id, batchId);
    if (own.error) return res.status(own.status).json({ error: own.error });

    const params = [batchId];
    let statusSql = '';
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      statusSql = ' AND a.status = $2';
      params.push(status);
    }
    const result = await pool.query(
      `SELECT a.*, s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand,
              s.photo_url, u.email
       FROM attendance_appeals a
       JOIN students s ON s.id = a.student_id
       JOIN users u ON u.id = s.user_id
       WHERE a.teacher_batch_id = $1 ${statusSql}
       ORDER BY a.created_at DESC`,
      params
    );
    res.json({ appeals: result.rows });
  } catch (err) {
    console.error('getBatchAppeals error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// POST /api/attendance/teacher/appeals/:appealId/review  { status, comment }
const reviewAppeal = async (req, res) => {
  const client = await pool.connect();
  try {
    const { appealId } = req.params;
    const { status, comment } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved or rejected.' });
    }

    const appeal = await client.query(
      `SELECT a.*, tb.teacher_id FROM attendance_appeals a
       JOIN teacher_batches tb ON tb.id = a.teacher_batch_id
       WHERE a.id = $1`,
      [appealId]
    );
    if (appeal.rows.length === 0) return res.status(404).json({ error: 'Appeal not found.' });

    const row = appeal.rows[0];
    const teacherRow = await client.query('SELECT id FROM teachers WHERE user_id = $1', [req.user.id]);
    const teacherId = teacherRow.rows[0]?.id;
    if (!teacherId || teacherId !== row.teacher_id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const updated = await client.query(
      `UPDATE attendance_appeals
       SET status = $1, teacher_comment = $2, reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [status, comment || null, req.user.id, appealId]
    );

    // If approved, update the attendance record accordingly.
    if (status === 'approved') {
      if (row.attendance_type === 'time_in') {
        await client.query(
          `INSERT INTO student_attendance (student_id, teacher_batch_id, date, status, check_in_time, appeal_time_in_id)
           VALUES ($1, $2, CURRENT_DATE, 'checked_in', CURRENT_TIMESTAMP, $3)
           ON CONFLICT (student_id, date) DO UPDATE SET
             check_in_time = COALESCE(student_attendance.check_in_time, CURRENT_TIMESTAMP),
             appeal_time_in_id = $3,
             updated_at = CURRENT_TIMESTAMP`,
          [row.student_id, row.teacher_batch_id, appealId]
        );
      } else {
        await client.query(
          `INSERT INTO student_attendance (student_id, teacher_batch_id, date, status, check_out_time, appeal_time_out_id)
           VALUES ($1, $2, CURRENT_DATE, 'checked_out', CURRENT_TIMESTAMP, $3)
           ON CONFLICT (student_id, date) DO UPDATE SET
             check_out_time = COALESCE(student_attendance.check_out_time, CURRENT_TIMESTAMP),
             appeal_time_out_id = $3,
             updated_at = CURRENT_TIMESTAMP`,
          [row.student_id, row.teacher_batch_id, appealId]
        );
      }
    }

    res.json({ appeal: updated.rows[0], message: `Appeal ${status}.` });
  } catch (err) {
    console.error('reviewAppeal error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

module.exports = {
  getBatchRecords,
  getBatchStats,
  getBatchAppeals,
  reviewAppeal,
};
