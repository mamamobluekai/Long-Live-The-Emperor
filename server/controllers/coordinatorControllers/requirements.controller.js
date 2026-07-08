const pool = require('../../db/');
const cloudinary = require('../../db/cloudinary');
const { normalize, validateStudentPayload } = require('./regexes/validation');
const {
  getOrCreateStudent,
  getOrCreateSubmission,
  calculateProgress,
  serializeRequirements,
} = require('./regexes/requirementsHelpers');
const streamifier = require('streamifier');

const upsertRequirements = async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validateStudentPayload(req.body, req.method === 'PUT');
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please review highlighted fields.', errors });

    await client.query('BEGIN');
    const userId = req.user.role === 'student' ? req.user.id : req.body.user_id;
    const student = await getOrCreateStudent(client, userId, req.body);
    await getOrCreateSubmission(client, student, userId);

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
    console.error('upsertRequirements error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  } finally {
    client.release();
  }
};

const submitRequirements = async (req, res) => {
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
    console.error('submitRequirements error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const getRequirements = async (req, res) => {
  const client = await pool.connect();
  try {
    const studentIdParam = req.params.studentId;
    let student;
    if (studentIdParam === 'me' || req.user.role === 'student') {
      student = await getOrCreateStudent(client, req.user.id, {});
    } else {
      const result = await client.query(
        `SELECT * FROM students WHERE id::text = $1 OR student_number = $1 OR user_id::text = $1 LIMIT 1`,
        [studentIdParam]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Student requirements not found.' });
      student = result.rows[0];
    }
    await getOrCreateSubmission(client, student, student.user_id);
    res.json(await serializeRequirements(client, student.id));
  } catch (err) {
    console.error('getRequirements error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
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

const uploadDocument = async (req, res) => {
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
    const progress = await calculateProgress(client, student.id);
    await client.query('COMMIT');
    res.status(201).json({ message: 'File uploaded successfully.', document: inserted.rows[0], ...progress });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('uploadDocument error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const deleteDocument = async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM student_documents sd
       USING students s
       WHERE sd.id = $1 AND sd.student_id = s.id
         AND ($2::text <> 'student' OR s.user_id = $3)
       RETURNING sd.student_id`,
      [req.params.id, req.user.role, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found.' });
    res.json({ message: 'Document deleted.' });
  } catch (err) {
    console.error('deleteDocument error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const listSubmissions = async (req, res) => {
  try {
    const { status = null, search = null } = req.query;
    const result = await pool.query(
      `SELECT s.*, st.student_number, st.first_name, st.last_name, st.email, st.grade_level, st.track_strand,
        COUNT(sd.id) AS uploaded_documents
       FROM student_requirement_submissions s
       JOIN students st ON st.id = s.student_id
       LEFT JOIN student_documents sd ON sd.submission_id = s.id
       WHERE ($1::text IS NULL OR s.status = $1)
         AND ($2::text IS NULL OR LOWER(st.student_number || ' ' || st.first_name || ' ' || st.last_name || ' ' || COALESCE(st.email,'')) LIKE LOWER('%' || $2 || '%'))
       GROUP BY s.id, st.id
       ORDER BY s.updated_at DESC`,
      [status === 'all' ? null : status, search || null]
    );
    res.json({ submissions: result.rows });
  } catch (err) {
    console.error('listSubmissions error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const reviewSubmission = async (req, res) => {
  const client = await pool.connect();
  try {
    const { status, remarks } = req.body;
    const allowed = ['Under Review', 'Approved', 'Rejected', 'Needs Revision'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid review status.' });
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE student_requirement_submissions
       SET status = $1, coordinator_feedback = $2, reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [status, remarks || null, req.user.id, req.params.id]
    );
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Submission not found.' });
    }
    await client.query(
      `INSERT INTO submission_logs (submission_id, actor_id, action, remarks) VALUES ($1,$2,$3,$4)`,
      [req.params.id, req.user.id, status, remarks || null]
    );
    await client.query('COMMIT');
    res.json({ message: 'Submission updated.', submission: result.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('reviewSubmission error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const verifyDocument = async (req, res) => {
  try {
    const { status, remarks } = req.body;
    if (!['Verified', 'Rejected'].includes(status)) return res.status(400).json({ error: 'Invalid document status.' });
    const result = await pool.query(
      `UPDATE student_documents
       SET status = $1, remarks = $2, verified_by = $3, verified_date = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [status, remarks || null, req.user.id, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found.' });
    res.json({ message: 'Document reviewed.', document: result.rows[0] });
  } catch (err) {
    console.error('verifyDocument error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = {
  upsertRequirements,
  submitRequirements,
  getRequirements,
  uploadDocument,
  deleteDocument,
  listSubmissions,
  reviewSubmission,
  verifyDocument,
};