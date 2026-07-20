const pool = require('../../db/');
const cloudinary = require('../../db/cloudinary');
const { normalize, validateStudentPayload } = require('../coordinatorControllers/regexes/validation');
const {
  getOrCreateStudent,
  getOrCreateSubmission,
  serializeRequirements,
} = require('../coordinatorControllers/regexes/requirementsHelpers');
const streamifier = require('streamifier');

const updateMyRequirements = async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validateStudentPayload(req.body, true);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please review highlighted fields.', errors });

    await client.query('BEGIN');
    const student = await getOrCreateStudent(client, req.user.id, req.body);
    await getOrCreateSubmission(client, student, req.user.id);

    const fields = [
      'student_number','first_name','middle_name','last_name','suffix','gender','birthdate','age',
      'contact_number','email','home_address','grade_level','section','track_strand','school',
      'preferred_industry','preferred_company','career_goal','industry_reason','guardian_name',
      'guardian_relationship','guardian_contact','guardian_email','guardian_address',
      'emergency_contact','emergency_contact_number','academic_notes',
    ];
    const updates = fields.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (updates.length) {
      const setSql = updates.map((field, index) => `${field} = $${index + 1}`).join(', ');
      await client.query(
        `UPDATE students SET ${setSql}, updated_at = CURRENT_TIMESTAMP WHERE id = $${updates.length + 1}`,
        [...updates.map((field) => normalize(req.body[field]) || null), student.id]
      );
    }

    const data = await serializeRequirements(client, student.id);
    await client.query('COMMIT');
    res.json({ message: 'Requirements saved automatically.', ...data });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('updateMyRequirements error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  } finally {
    client.release();
  }
};

const submitMyRequirements = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const student = await getOrCreateStudent(client, req.user.id, req.body);
    const submission = await getOrCreateSubmission(client, student, req.user.id);
    const data = await serializeRequirements(client, student.id);

    if (data.progress < 100) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Complete every required section before submitting.', missingDocuments: data.missingDocuments });
    }

    await client.query(
      `UPDATE student_requirement_submissions
       SET status = 'Pending Review', submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [submission.id]
    );
    await client.query(
      `INSERT INTO submission_logs (submission_id, actor_id, action, remarks) VALUES ($1,$2,'Submitted','Requirements submitted successfully.')`,
      [submission.id, req.user.id]
    );
    await client.query('COMMIT');
    res.json({ message: 'Requirements submitted successfully.', status: 'Pending Review' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('submitMyRequirements error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const getMyRequirements = async (req, res) => {
  const client = await pool.connect();
  try {
    const student = await getOrCreateStudent(client, req.user.id, {});
    await getOrCreateSubmission(client, student, req.user.id);
    res.json(await serializeRequirements(client, student.id));
  } catch (err) {
    console.error('getMyRequirements error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const uploadMyDocument = async (req, res) => {
  const client = await pool.connect();
  try {
    const { document_code } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Please choose a file to upload.' });
    if (!document_code) return res.status(400).json({ error: 'Document type is required.' });

    await client.query('BEGIN');
    const student = await getOrCreateStudent(client, req.user.id, {});
    const submission = await getOrCreateSubmission(client, student, req.user.id);
    const type = await client.query('SELECT * FROM document_types WHERE code = $1', [document_code]);
    if (!type.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid document type.' });
    }

    await client.query(
      `DELETE FROM student_documents WHERE student_id = $1 AND document_type_id = $2`,
      [student.id, type.rows[0].id]
    );

    const resourceType = req.file.mimetype.startsWith('image/') ? 'image' : 'raw';
    const result = await uploadToCloudinary(req.file.buffer, resourceType);

    const inserted = await client.query(
      `INSERT INTO student_documents
       (submission_id, student_id, document_type_id, document_name, file_path, original_name, mime_type, file_size, cloudinary_public_id, cloudinary_url, resource_type, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Uploaded')
       RETURNING *`,
      [
        submission.id,
        student.id,
        type.rows[0].id,
        type.rows[0].name,
        result.secure_url,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        result.public_id,
        result.secure_url,
        resourceType,
      ]
    );
    await client.query(
      `INSERT INTO submission_logs (submission_id, actor_id, action, remarks) VALUES ($1,$2,'Uploaded document',$3)`,
      [submission.id, req.user.id, type.rows[0].name]
    );
    const { progress } = await require('../coordinatorControllers/regexes/requirementsHelpers').calculateProgress(client, student.id);
    await client.query('COMMIT');
    res.status(201).json({ message: 'File uploaded successfully.', document: inserted.rows[0], progress });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('uploadMyDocument error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const deleteMyDocument = async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM student_documents sd
       USING students s
       WHERE sd.id = $1 AND sd.student_id = s.id AND s.user_id = $2
       RETURNING sd.student_id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found or not authorized.' });
    res.json({ message: 'Document deleted.' });
  } catch (err) {
    console.error('deleteMyDocument error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getMySubmissionStatus = async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      const student = await getOrCreateStudent(client, req.user.id, {});
      const submission = await getOrCreateSubmission(client, student, req.user.id);
      res.json({ submission });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('getMySubmissionStatus error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

function uploadToCloudinary(buffer, resourceType) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: resourceType, folder: 'student_documents' },
      (err, result) => err ? reject(err) : resolve(result)
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

// GET /api/student/progress
// Aggregates immersion completion across requirements, documentation, and
// attendance so the student dashboard can render a single progress view.
const REQUIRED_ATTENDANCE_DAYS = 10;

const getProgress = async (req, res) => {
  const client = await pool.connect();
  try {
    const student = await getOrCreateStudent(client, req.user.id, {});
    const studentId = student.id;

    // Requirements approval
    const submission = await getOrCreateSubmission(client, student, req.user.id);
    const requirementsApproved = submission.status === 'Approved';

    // Documentation graded: every requirement document that has been uploaded
    // must have been verified (graded) by the coordinator.
    const docs = await client.query(
      `SELECT status FROM student_documents WHERE student_id = $1`,
      [studentId]
    );
    const totalDocs = docs.rows.length;
    const verifiedDocs = docs.rows.filter((d) => d.status === 'Verified').length;
    const documentationGraded = totalDocs > 0 && verifiedDocs === totalDocs;

    // Attendance: count distinct days with both time-in and time-out recorded.
    const att = await client.query(
      `SELECT COUNT(DISTINCT date)::int AS days
       FROM student_attendance
       WHERE student_id = $1 AND check_in_time IS NOT NULL AND check_out_time IS NOT NULL`,
      [studentId]
    );
    const attendanceDays = att.rows[0]?.days || 0;
    const attendanceComplete = attendanceDays >= REQUIRED_ATTENDANCE_DAYS;

    const completed =
      requirementsApproved && documentationGraded && attendanceComplete;

    res.json({
      requirements: { approved: requirementsApproved, status: submission.status },
      documentation: {
        graded: documentationGraded,
        total: totalDocs,
        verified: verifiedDocs,
      },
      attendance: {
        complete: attendanceComplete,
        days: attendanceDays,
        required: REQUIRED_ATTENDANCE_DAYS,
      },
      completed,
    });
  } catch (err) {
    console.error('getProgress error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

module.exports = {
  updateMyRequirements,
  submitMyRequirements,
  getMyRequirements,
  uploadMyDocument,
  deleteMyDocument,
  getMySubmissionStatus,
  getProgress,
};
