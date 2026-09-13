// Student-facing attendance appeals.
const multer = require('multer');
const path = require('path');
const streamifier = require('streamifier');
const cloudinary = require('../../db/cloudinary');
const pool = require('../../db');
const { getIO } = require('../../sockets');
const { nowInManilaDateOnly, isValidManilaDate } = require('../../utils/manilaDate');

// Format a DATE column from node-postgres as a stable YYYY-MM-DD string.
// node-postgres returns DATE columns as JS Date objects anchored to UTC
// midnight; serializing them as JSON produces an ISO timestamp in UTC.
// Clients in any other timezone would then substring(0, 10) and get the
// wrong calendar day. We use the date's UTC components (the calendar day
// the DB actually stored) so the wire format is timezone-independent.
function formatDateColumn(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

function formatAppealDates(appeal) {
  if (!appeal) return appeal;
  return { ...appeal, appeal_date: formatDateColumn(appeal.appeal_date) };
}

const TZ = 'Asia/Manila';

function nowLocalDate(timezone = TZ) {
  // Backwards-compat shim — delegates to the shared Manila helper.
  if (timezone === TZ) return nowInManilaDateOnly();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

function uploadToCloudinary(buffer, originalName) {
  return new Promise((resolve, reject) => {
    const resourceType = originalName.match(/\.(pdf)$/i) ? 'raw' : 'image';
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: resourceType, folder: 'attendance_appeals' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

async function ensureAppealDateColumn(client = pool) {
  await client.query(`ALTER TABLE attendance_appeals ADD COLUMN IF NOT EXISTS appeal_date DATE DEFAULT CURRENT_DATE`);
}

// POST /api/attendance/appeal  (multipart: attendance_type, excuse, file?)
const submitAppeal = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureAppealDateColumn(client);
    const userId = req.user.id;
    const { attendance_type, excuse, appeal_date } = req.body;

    if (!['time_in', 'time_out'].includes(attendance_type)) {
      return res.status(400).json({ message: 'attendance_type must be time_in or time_out.' });
    }
    if (!excuse || !excuse.trim()) {
      return res.status(400).json({ message: 'An excuse message is required.' });
    }

    const studentRes = await client.query('SELECT id FROM students WHERE user_id = $1', [userId]);
    const student = studentRes.rows[0];
    if (!student) return res.status(404).json({ message: 'Student profile not found.' });

    const batchRes = await client.query(
      `SELECT tbs.teacher_batch_id,
              (SELECT teacher_id FROM teacher_batches WHERE id = tbs.teacher_batch_id) AS teacher_id
       FROM teacher_batch_students tbs
       JOIN students s ON s.id = tbs.student_id OR s.user_id = tbs.student_id
       WHERE s.user_id = $1 OR tbs.student_id = $1
       ORDER BY tbs.assigned_at DESC LIMIT 1`,
      [userId]
    );
    if (batchRes.rows.length === 0) {
      return res.status(400).json({ message: 'You are not assigned to a batch yet.' });
    }
    const { teacher_batch_id, teacher_id } = batchRes.rows[0];

    // The appeal date is the date the student is appealing FOR, not today.
    // The client always sends the day that was clicked in the calendar; we
    // validate it against the student's actual batch attendance dates
    // (mirroring the same weekday-skipping logic that generates the
    // student's My Schedule list) and fall back to Manila today only if
    // the client didn't send one. This makes the audit trail accurate:
    // "appealed Aug 28" really is Aug 28, and the teacher can see exactly
    // which day the student is appealing for.
    //
    // We deliberately do NOT trust work_immersion_schedules.end_date here:
    // older rows may have end_date = NULL (the column was added in a
    // later migration), and using a stored end_date would also mis-validate
    // whenever the stored range is wider than the actual attendance dates
    // (e.g. a schedule that includes a holiday that the teacher removed).
    let appealDate = null;
    const sentDate = String(appeal_date || '').trim();
    if (isValidManilaDate(sentDate)) {
      const batchSchedules = await client.query(
        `SELECT start_date, duration_type, duration_value
         FROM work_immersion_schedules
         WHERE teacher_batch_id = $1`,
        [teacher_batch_id]
      );
      const dateOnly = (v) => {
        if (!v) return null;
        if (v instanceof Date) {
          return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
        }
        return String(v).slice(0, 10);
      };
      // Build the same Mon–Fri attendance date list the client sees in
      // its schedule, and accept the appeal if `sentDate` is in that set.
      const isInAnySchedule = batchSchedules.rows.some((r) => {
        const startStr = dateOnly(r.start_date);
        if (!startStr) return false;
        const [y, m, d] = startStr.split('-').map(Number);
        const cur = new Date(Date.UTC(y, m - 1, d));
        const totalDays = r.duration_type === 'hours'
          ? Math.ceil(Number(r.duration_value) / 8)
          : Number(r.duration_value);
        for (let i = 0; i < totalDays; i++) {
          const dow = cur.getUTCDay();
          if (dow !== 0 && dow !== 6) {
            const curStr = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}-${String(cur.getUTCDate()).padStart(2, '0')}`;
            if (curStr === sentDate) return true;
          }
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
        return false;
      });
      if (isInAnySchedule) {
        appealDate = sentDate;
      }
    }
    if (!appealDate) appealDate = nowLocalDate();

    let fileUrl = null;
    let fileName = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, req.file.originalname);
      fileUrl = result.secure_url;
      fileName = req.file.originalname;
    }

    const insert = await client.query(
      `INSERT INTO attendance_appeals
        (student_id, teacher_batch_id, teacher_id, attendance_type, appeal_date, excuse, file_url, file_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [student.id, teacher_batch_id, teacher_id, attendance_type, appealDate, excuse.trim(), fileUrl, fileName]
    );

    const full = await client.query(
      `SELECT a.*, s.first_name, s.last_name, s.student_number
       FROM attendance_appeals a JOIN students s ON s.id = a.student_id
       WHERE a.id = $1`,
      [insert.rows[0].id]
    );

    getIO().to(`batch:${teacher_batch_id}`).emit('attendance:appeal_submitted', formatAppealDates(full.rows[0]));

    res.status(201).json({ message: 'Appeal submitted.', appeal: formatAppealDates(full.rows[0]) });
  } catch (err) {
    console.error('submitAppeal error:', err);
    res.status(500).json({ message: 'Failed to submit appeal.' });
  } finally {
    client.release();
  }
};

// GET /api/attendance/appeals/me
const getMyAppeals = async (req, res) => {
  try {
    await ensureAppealDateColumn();
    const userId = req.user.id;
    const studentRes = await pool.query('SELECT id FROM students WHERE user_id = $1', [userId]);
    const student = studentRes.rows[0];
    if (!student) return res.status(404).json({ message: 'Student profile not found.' });

    const result = await pool.query(
      `SELECT * FROM attendance_appeals WHERE student_id = $1 ORDER BY created_at DESC`,
      [student.id]
    );
    const appeals = result.rows.map(formatAppealDates);
    res.json({ appeals });
  } catch (err) {
    console.error('getMyAppeals error:', err);
    res.status(500).json({ message: 'Failed to fetch appeals.' });
  }
};

// DELETE /api/attendance/appeals/:appealId
// Students may delete only their own appeals that are still pending.
const deleteMyAppeal = async (req, res) => {
  const { appealId } = req.params;
  try {
    await ensureAppealDateColumn();
    const userId = req.user.id;
    const studentRes = await pool.query('SELECT id FROM students WHERE user_id = $1', [userId]);
    const student = studentRes.rows[0];
    if (!student) return res.status(404).json({ message: 'Student profile not found.' });

    const existing = await pool.query(
      `SELECT id, status FROM attendance_appeals WHERE id = $1 AND student_id = $2`,
      [appealId, student.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Appeal not found.' });
    }
    if (existing.rows[0].status !== 'pending') {
      return res.status(400).json({ message: 'Only pending appeals can be deleted.' });
    }

    await pool.query(`DELETE FROM attendance_appeals WHERE id = $1`, [appealId]);
    res.json({ message: 'Appeal deleted.', appealId: Number(appealId) });
  } catch (err) {
    console.error('deleteMyAppeal error:', err);
    res.status(500).json({ message: 'Failed to delete appeal.' });
  }
};

module.exports = { upload, submitAppeal, getMyAppeals, deleteMyAppeal };
