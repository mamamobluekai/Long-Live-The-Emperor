// Student-facing attendance appeals.
const multer = require('multer');
const path = require('path');
const streamifier = require('streamifier');
const cloudinary = require('../../db/cloudinary');
const pool = require('../../db');
const { getIO } = require('../../sockets');

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

// POST /api/attendance/appeal  (multipart: attendance_type, excuse, file?)
const submitAppeal = async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { attendance_type, excuse } = req.body;

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
       FROM teacher_batch_students tbs WHERE tbs.student_id = $1
       ORDER BY tbs.assigned_at DESC LIMIT 1`,
      [userId]
    );
    if (batchRes.rows.length === 0) {
      return res.status(400).json({ message: 'You are not assigned to a batch yet.' });
    }
    const { teacher_batch_id, teacher_id } = batchRes.rows[0];

    let fileUrl = null;
    let fileName = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, req.file.originalname);
      fileUrl = result.secure_url;
      fileName = req.file.originalname;
    }

    const insert = await client.query(
      `INSERT INTO attendance_appeals
        (student_id, teacher_batch_id, teacher_id, attendance_type, excuse, file_url, file_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [student.id, teacher_batch_id, teacher_id, attendance_type, excuse.trim(), fileUrl, fileName]
    );

    const full = await client.query(
      `SELECT a.*, s.first_name, s.last_name, s.student_number
       FROM attendance_appeals a JOIN students s ON s.id = a.student_id
       WHERE a.id = $1`,
      [insert.rows[0].id]
    );

    getIO().to(`batch:${teacher_batch_id}`).emit('attendance:appeal_submitted', full.rows[0]);

    res.status(201).json({ message: 'Appeal submitted.', appeal: full.rows[0] });
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
    const userId = req.user.id;
    const studentRes = await pool.query('SELECT id FROM students WHERE user_id = $1', [userId]);
    const student = studentRes.rows[0];
    if (!student) return res.status(404).json({ message: 'Student profile not found.' });

    const result = await pool.query(
      `SELECT * FROM attendance_appeals WHERE student_id = $1 ORDER BY created_at DESC`,
      [student.id]
    );
    res.json({ appeals: result.rows });
  } catch (err) {
    console.error('getMyAppeals error:', err);
    res.status(500).json({ message: 'Failed to fetch appeals.' });
  }
};

module.exports = { upload, submitAppeal, getMyAppeals };
