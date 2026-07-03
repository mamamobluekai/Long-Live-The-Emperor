const pool = require('../../db/');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function getClientUrl() {
  return process.env.CLIENT_URL || 'http://localhost:5173';
}

// Sends the same style of approval email as the admin controller, worded
// for a coordinator approving a student instead of an admin approving staff.
async function sendStudentApprovalEmail(user) {
  try {
    await transporter.sendMail({
      from: `"Work Immersion System" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Your Work Immersion Student Account is Approved',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2a5298;">Account Approved</h2>
          <p>Hello <strong>${user.first_name} ${user.last_name}</strong>,</p>
          <p>Your Student account has been approved by your coordinator. You can now log in to the Work Immersion Management System.</p>
          <p><strong>Email:</strong> ${user.email}</p>
          <p style="margin: 20px 0;">
            <a href="${getClientUrl()}/login" style="background: #2a5298; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Log In
            </a>
          </p>
          <p style="color: #666; font-size: 12px;">Marinduque National High School - Work Immersion Office</p>
        </div>
      `,
    });
    console.log(`Approval email sent to ${user.email}`);
  } catch (emailErr) {
    console.error(`Failed to send approval email to ${user.email}:`, emailErr.message);
  }
}


const getPendingStudents = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.status, u.created_at, s.first_name, s.last_name, s.student_number
       FROM users u
       JOIN students s ON u.id = s.user_id
       WHERE u.role = 'student' AND u.status = 'pending'
       ORDER BY u.created_at DESC`
    );
    res.json({ students: result.rows });
  } catch (err) {
    console.error('Get pending students error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};


const approveStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE users SET status = 'approved', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'pending' AND role = 'student'
       RETURNING id, email, role`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found, already processed, or not a student.' });
    }

    // Get student details
    const studentResult = await pool.query(
      `SELECT first_name, last_name FROM students WHERE user_id = $1`,
      [id]
    );

    const user = result.rows[0];
    if (studentResult.rows.length > 0) {
      user.first_name = studentResult.rows[0].first_name;
      user.last_name = studentResult.rows[0].last_name;
    }

    await sendStudentApprovalEmail(user);

    res.json({ message: 'Student approved.', user });
  } catch (err) {
    console.error('Approve student error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const disapproveStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE users SET status = 'disapproved', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'pending' AND role = 'student'
       RETURNING id, email, role`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found, already processed, or not a student.' });
    }

    // Get student details
    const studentResult = await pool.query(
      `SELECT first_name, last_name FROM students WHERE user_id = $1`,
      [id]
    );

    const user = result.rows[0];
    if (studentResult.rows.length > 0) {
      user.first_name = studentResult.rows[0].first_name;
      user.last_name = studentResult.rows[0].last_name;
    }

    res.json({ message: 'Student disapproved.', user });
  } catch (err) {
    console.error('Disapprove student error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const requiredInfoFields = [
  'student_number', 'first_name', 'last_name', 'gender', 'birthdate', 'age',
  'contact_number', 'email', 'home_address', 'grade_level', 'section',
  'track_strand', 'school', 'preferred_industry', 'career_goal', 'industry_reason',
  'guardian_name', 'guardian_relationship', 'guardian_contact', 'guardian_email',
  'guardian_address', 'emergency_contact', 'emergency_contact_number',
];

const requiredDocumentCodes = [
  'guardian_consent',
  'medical_certificate',
  'accident_insurance',
  'vaccination_record',
  'emergency_contact_form',
  'form_138',
  'good_moral',
  'psa_birth_certificate',
  'id_picture',
  'student_profile_form',
];

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^[0-9+\-\s()]{7,20}$/;

const normalize = (value) => (typeof value === 'string' ? value.trim() : value);

const validateStudentPayload = (body, partial = false) => {
  const errors = {};
  const source = body || {};

  if (!partial) {
    requiredInfoFields.forEach((field) => {
      if (!normalize(source[field])) errors[field] = 'This field is required.';
    });
  }

  ['email', 'guardian_email'].forEach((field) => {
    if (source[field] && !emailRegex.test(source[field])) errors[field] = 'Enter a valid email address.';
  });

  ['contact_number', 'guardian_contact', 'emergency_contact_number'].forEach((field) => {
    if (source[field] && !phoneRegex.test(source[field])) errors[field] = 'Enter a valid phone number.';
  });

  if (source.age && Number(source.age) < 0) errors.age = 'Age must be a positive number.';

  return errors;
};

const getOrCreateStudent = async (client, userId, body = {}) => {
  const userResult = await client.query(
    `SELECT u.id, u.email, u.phone
     FROM users u
     WHERE u.id = $1 AND u.role = 'student'`,
    [userId]
  );

  if (userResult.rows.length === 0) throw new Error('Student account not found.');
  const user = userResult.rows[0];

  const existing = await client.query('SELECT * FROM students WHERE user_id = $1', [userId]);
  if (existing.rows.length) return existing.rows[0];

  const studentNumber = normalize(body.student_number) || `S-${userId}`;

  const created = await client.query(
    `INSERT INTO students (user_id, student_number, first_name, last_name, email, contact_number)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      userId,
      studentNumber,
      normalize(body.first_name) || 'Student',
      normalize(body.last_name) || 'User',
      user.email,
      user.phone || normalize(body.contact_number) || '',
    ]
  );

  return created.rows[0];
};

const getOrCreateSubmission = async (client, student, userId) => {
  const existing = await client.query(
    `SELECT * FROM student_requirement_submissions WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [student.id]
  );
  if (existing.rows.length) return existing.rows[0];

  const created = await client.query(
    `INSERT INTO student_requirement_submissions (student_id, user_id, status, progress)
     VALUES ($1, $2, 'Pending', 0)
     RETURNING *`,
    [student.id, userId]
  );
  return created.rows[0];
};

const calculateProgress = async (client, studentId) => {
  const studentResult = await client.query('SELECT * FROM students WHERE id = $1', [studentId]);
  const student = studentResult.rows[0] || {};
  const docs = await client.query(
    `SELECT dt.code
     FROM student_documents sd
     JOIN document_types dt ON dt.id = sd.document_type_id
     WHERE sd.student_id = $1`,
    [studentId]
  );
  const uploadedCodes = new Set(docs.rows.map((row) => row.code));

  const personalComplete = requiredInfoFields
    .filter((field) => !field.startsWith('guardian_') && !field.startsWith('emergency_'))
    .every((field) => normalize(student[field]));
  const guardianComplete = [
    'guardian_name', 'guardian_relationship', 'guardian_contact', 'guardian_email',
    'guardian_address', 'emergency_contact', 'emergency_contact_number',
  ].every((field) => normalize(student[field])) && uploadedCodes.has('guardian_consent');
  const medicalComplete = ['medical_certificate', 'accident_insurance', 'vaccination_record', 'emergency_contact_form']
    .every((code) => uploadedCodes.has(code));
  const academicComplete = ['form_138', 'good_moral', 'psa_birth_certificate', 'id_picture', 'student_profile_form']
    .every((code) => uploadedCodes.has(code));

  const sections = { personalComplete, guardianComplete, medicalComplete, academicComplete };
  const progress = Object.values(sections).filter(Boolean).length * 25;
  await client.query(
    `UPDATE student_requirement_submissions SET progress = $1, updated_at = CURRENT_TIMESTAMP WHERE student_id = $2`,
    [progress, studentId]
  );

  return { progress, sections, missingDocuments: requiredDocumentCodes.filter((code) => !uploadedCodes.has(code)) };
};

const serializeRequirements = async (client, studentId) => {
  const student = await client.query('SELECT * FROM students WHERE id = $1', [studentId]);
  const submission = await client.query(
    `SELECT s.*, u.first_name || ' ' || u.last_name AS reviewed_by_name
     FROM student_requirement_submissions s
     LEFT JOIN users u ON u.id = s.reviewed_by
     WHERE s.student_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
    [studentId]
  );
  const documents = await client.query(
    `SELECT sd.*, dt.code, dt.section
     FROM student_documents sd
     LEFT JOIN document_types dt ON dt.id = sd.document_type_id
     WHERE sd.student_id = $1
     ORDER BY sd.uploaded_date DESC`,
    [studentId]
  );
  const logs = await client.query(
    `SELECT sl.*, u.first_name || ' ' || u.last_name AS actor_name
     FROM submission_logs sl
     LEFT JOIN users u ON u.id = sl.actor_id
     WHERE sl.submission_id = $1
     ORDER BY sl.created_at DESC LIMIT 20`,
    [submission.rows[0]?.id || 0]
  );
  const progress = await calculateProgress(client, studentId);

  return {
    student: student.rows[0] || null,
    submission: submission.rows[0] || null,
    documents: documents.rows,
    logs: logs.rows,
    ...progress,
  };
};

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
    const publicPath = `uploads/requirements/${req.file.filename}`;
    const inserted = await client.query(
      `INSERT INTO student_documents
       (submission_id, student_id, document_type_id, document_name, file_path, original_name, mime_type, file_size, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Uploaded')
       RETURNING *`,
      [submission.id, student.id, type.rows[0].id, type.rows[0].name, publicPath, req.file.originalname, req.file.mimetype, req.file.size]
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
const createTeacherBatch = async (req, res) => {
  const client = await pool.connect();
  try {
    const coordinatorId = req.user.id;
    const { teacher_id, batch_label, max_students } = req.body;

    if (!teacher_id || !batch_label || !max_students) {
      return res.status(400).json({ error: 'teacher_id, batch_label, and max_students are required.' });
    }

    const max = Number(max_students);
    if (!Number.isInteger(max) || max <= 0) {
      return res.status(400).json({ error: 'max_students must be a positive integer.' });
    }

    // Validate teacher role
    const teacherCheck = await client.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'teacher'`,
      [teacher_id]
    );
    if (teacherCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid teacher_id.' });
    }

    const existingTeacherBatch = await client.query(
      `SELECT id FROM teacher_batches WHERE teacher_id = $1 LIMIT 1`,
      [teacher_id]
    );
    if (existingTeacherBatch.rows.length > 0) {
      return res.status(409).json({ error: 'Teacher is already assigned to a batch.' });
    }

    // Coordinator ownership rule: creator becomes coordinator_id
    const result = await client.query(
      `INSERT INTO teacher_batches (coordinator_id, teacher_id, batch_label, max_students)
       VALUES ($1, $2, $3, $4)
       RETURNING id, coordinator_id, teacher_id, batch_label, max_students, created_at, updated_at`,
      [coordinatorId, teacher_id, batch_label, max]
    );

    res.status(201).json({ batch: result.rows[0] });
  } catch (err) {
    // If unique constraint on (teacher_id, batch_label) exists, this may trigger
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Batch already exists for this teacher.' });
    }
    console.error('createTeacherBatch error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const updateTeacherBatch = async (req, res) => {
  const client = await pool.connect();
  try {
    const coordinatorId = req.user.id;
    const { batchId } = req.params;
    const { max_students, batch_label } = req.body;

    if (!max_students && !batch_label) {
      return res.status(400).json({ error: 'max_students or batch_label is required.' });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (max_students) {
      const max = Number(max_students);
      if (!Number.isInteger(max) || max <= 0) {
        return res.status(400).json({ error: 'max_students must be a positive integer.' });
      }
      fields.push(`max_students = $${idx++}`);
      values.push(max);
    }

    if (batch_label) {
      fields.push(`batch_label = $${idx++}`);
      values.push(batch_label);
    }

    const sql = `
      UPDATE teacher_batches
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idx++}
        AND coordinator_id = $${idx}
      RETURNING id, coordinator_id, teacher_id, batch_label, max_students, created_at, updated_at
    `;

    values.push(batchId);
    values.push(coordinatorId);

    const result = await client.query(sql, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found or insufficient permissions.' });
    }

    res.json({ batch: result.rows[0] });
  } catch (err) {
    console.error('updateTeacherBatch error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const deleteTeacherBatch = async (req, res) => {
  const client = await pool.connect();
  try {
    const coordinatorId = req.user.id;
    const { batchId } = req.params;

    const batchCheck = await client.query(
      `SELECT id FROM teacher_batches WHERE id = $1 AND coordinator_id = $2`,
      [batchId, coordinatorId]
    );

    if (batchCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found or insufficient permissions.' });
    }

    await client.query('BEGIN');
    await client.query(`DELETE FROM teacher_batch_students WHERE teacher_batch_id = $1`, [batchId]);
    await client.query(`DELETE FROM teacher_batches WHERE id = $1`, [batchId]);
    await client.query('COMMIT');

    res.json({ message: 'Batch deleted successfully.' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('deleteTeacherBatch error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const assignApprovedStudentsToBatch = async (req, res) => {
  const client = await pool.connect();
  try {
    const coordinatorId = req.user.id;
    const { batchId } = req.params;
    const { student_ids } = req.body;

    if (!Array.isArray(student_ids)) {
      return res.status(400).json({ error: 'student_ids must be an array.' });
    }

    // Validate batch ownership
    const batchCheck = await client.query(
      `SELECT id, coordinator_id, teacher_id, max_students
       FROM teacher_batches
       WHERE id = $1`,
      [batchId]
    );

    if (batchCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found.' });
    }
    if (batchCheck.rows[0].coordinator_id !== coordinatorId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const max = Number(batchCheck.rows[0].max_students);
    const uniqueStudentIds = Array.from(new Set(student_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))));

    if (uniqueStudentIds.length > max) {
      return res.status(400).json({ error: `Exceeds max capacity. Max: ${max}, Selected: ${uniqueStudentIds.length}` });
    }

    // Only students with completed requirements can be assigned.
    // This intentionally does not depend on the user's account approval status.
    const studentsCheck = await client.query(
      `SELECT u.id
       FROM users u
       JOIN student_requirement_submissions srs ON srs.user_id = u.id
       WHERE u.role = 'student'
         AND srs.progress = 100
         AND srs.status NOT IN ('Rejected', 'Needs Revision')
         AND u.id = ANY($1::int[])`,
      [uniqueStudentIds]
    );

    const completedFoundIds = studentsCheck.rows.map((r) => r.id);
    const missingCount = uniqueStudentIds.length - completedFoundIds.length;
    if (missingCount > 0) {
      return res.status(400).json({ error: 'One or more students have not completed requirements or were not found.' });
    }

    // Conflict rule: a student cannot be assigned to another teacher/batch (any teacher batch other than this one)
    // Allow re-assigning within the same batchId.
    const conflictCheck = await client.query(
      `SELECT DISTINCT tbs.student_id
       FROM teacher_batch_students tbs
       JOIN teacher_batches tb ON tb.id = tbs.teacher_batch_id
       WHERE tb.coordinator_id = $1
         AND tbs.student_id = ANY($2::int[])
         AND tbs.teacher_batch_id <> $3`,
      [coordinatorId, uniqueStudentIds, batchId]
    );

    const conflictedIds = conflictCheck.rows.map((r) => r.student_id);
    if (conflictedIds.length > 0) {
      return res.status(409).json({
        error: 'One or more students are already assigned to another teacher batch.',
        conflicts: conflictedIds,
      });
    }

    await client.query('BEGIN');

    // Replace assignments for that batch
    await client.query(
      `DELETE FROM teacher_batch_students WHERE teacher_batch_id = $1`,
      [batchId]
    );

    if (uniqueStudentIds.length > 0) {
      // Parameterize using VALUES with dynamic placeholders
      const placeholders = uniqueStudentIds.map((_, i) => `($1, $${i + 2}, NOW())`).join(',');
      const params = [batchId, ...uniqueStudentIds];
      await client.query(
        `INSERT INTO teacher_batch_students (teacher_batch_id, student_id, assigned_at)
         VALUES ${placeholders}`,
        params
      );
    }

    await client.query('COMMIT');

    res.json({ message: 'Students assigned successfully.' });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('assignApprovedStudentsToBatch error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const getRequirementCompletedStudentsForCoordinator = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.student_id,
         u.first_name,
         u.last_name,
         u.email,
         u.grade_level,
         u.strand,
         u.phone,
         u.status AS account_status,
         srs.status AS requirements_status,
         srs.progress,
         srs.submitted_at
       FROM users u
       JOIN student_requirement_submissions srs ON srs.user_id = u.id
       WHERE u.role = 'student'
         AND srs.progress = 100
         AND srs.status NOT IN ('Rejected', 'Needs Revision')
       ORDER BY srs.updated_at DESC, u.last_name ASC`
    );

    res.json({ students: result.rows });
  } catch (err) {
    console.error('getRequirementCompletedStudentsForCoordinator error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getMyTeacherBatches = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const result = await pool.query(
      `SELECT id, teacher_id, batch_label, max_students, created_at, updated_at
       FROM teacher_batches
       WHERE teacher_id = $1
       ORDER BY created_at DESC`,
      [teacherId]
    );

    res.json({ batches: result.rows });
  } catch (err) {
    console.error('getMyTeacherBatches error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getTeacherBatchStudents = async (req, res) => {
  try {
    const { batchId } = req.params;
    const requesterId = req.user.id;

    // If teacher: must own the batch
    if (req.user.role === 'teacher') {
      const ownership = await pool.query(
        `SELECT id
         FROM teacher_batches
         WHERE id = $1 AND teacher_id = $2`,
        [batchId, requesterId]
      );
      if (ownership.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    // coordinator/admin can access after verifying ownership for coordinator
    if (req.user.role === 'coordinator') {
      const ownership = await pool.query(
        `SELECT id
         FROM teacher_batches
         WHERE id = $1 AND coordinator_id = $2`,
        [batchId, requesterId]
      );
      if (ownership.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    const result = await pool.query(
      `SELECT
         u.id,
         u.student_id,
         u.first_name,
         u.last_name,
         u.email,
         u.grade_level,
         u.strand,
         u.phone,
         u.status,
         tbs.assigned_at
       FROM teacher_batch_students tbs
       JOIN users u ON u.id = tbs.student_id
       WHERE tbs.teacher_batch_id = $1
       ORDER BY tbs.assigned_at DESC`,
      [batchId]
    );

    res.json({ students: result.rows });
  } catch (err) {
    console.error('getTeacherBatchStudents error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getTeachersListForCoordinator = async (req, res) => {
  try {
    const { status } = req.query;
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, status, employee_id, department, created_at
       FROM users
       WHERE role = 'teacher'
         AND ($1::text IS NULL OR status = $1)
       ORDER BY created_at DESC`,
      [status || null]
    );

    res.json({ teachers: result.rows });
  } catch (err) {
    console.error('getTeachersListForCoordinator error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getCoordinatorBatchesWithAssignedStudents = async (req, res) => {
  try {
    const coordinatorId = req.user.id;

    const rows = await pool.query(
      `SELECT
         tb.id AS batch_id,
         tb.batch_label,
         tb.max_students,
         tb.teacher_id,
         u.first_name,
         u.last_name,
         u.employee_id,
         tb.created_at,
         tb.updated_at,
         tbs.student_id,
         tbs.assigned_at,
         su.student_id AS student_number,
         su.first_name AS student_first_name,
         su.last_name AS student_last_name,
         su.email AS student_email,
         su.strand AS student_strand
       FROM teacher_batches tb
       JOIN users u ON u.id = tb.teacher_id
       LEFT JOIN teacher_batch_students tbs ON tbs.teacher_batch_id = tb.id
       LEFT JOIN users su ON su.id = tbs.student_id
       WHERE tb.coordinator_id = $1
       ORDER BY tb.created_at DESC, tbs.assigned_at DESC`,
      [coordinatorId]
    );

    const batchesMap = new Map();

    for (const r of rows.rows || []) {
      if (!batchesMap.has(r.batch_id)) {
        batchesMap.set(r.batch_id, {
          id: r.batch_id,
          batch_label: r.batch_label,
          max_students: r.max_students,
          teacher: {
            id: r.teacher_id,
            first_name: r.first_name,
            last_name: r.last_name,
            employee_id: r.employee_id,
          },
          students: [],
          created_at: r.created_at,
          updated_at: r.updated_at,
        });
      }

      if (r.student_id) {
        batchesMap.get(r.batch_id).students.push({
          id: r.student_id,
          student_id: r.student_number,
          first_name: r.student_first_name,
          last_name: r.student_last_name,
          email: r.student_email,
          strand: r.student_strand,
          assigned_at: r.assigned_at,
        });
      }
    }

    res.json({ batches: Array.from(batchesMap.values()) });
  } catch (err) {
    console.error('getCoordinatorBatchesWithAssignedStudents error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getSupervisorsListForCoordinator = async (req, res) => {
  try {
    const { status } = req.query;
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, status, company_name, designation, phone, created_at
       FROM users
       WHERE role = 'supervisor'
         AND ($1::text IS NULL OR status = $1)
       ORDER BY created_at DESC`,
      [status || null]
    );
    res.json({ supervisors: result.rows });
  } catch (err) {
    console.error('getSupervisorsListForCoordinator error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};
const createSupervisorRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    const supervisorId = req.user.id;
    const { coordinator_id, batch_label, strand, num_students, notes } = req.body;

    if (!coordinator_id || !batch_label || !num_students) {
      return res.status(400).json({ error: 'coordinator_id, batch_label, and num_students are required.' });
    }

    const num = Number(num_students);
    if (!Number.isInteger(num) || num <= 0) {
      return res.status(400).json({ error: 'num_students must be a positive integer.' });
    }

    const coordinatorCheck = await client.query(
      `SELECT id FROM users WHERE id = $1 AND role IN ('coordinator', 'admin')`,
      [coordinator_id]
    );
    if (coordinatorCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid coordinator_id.' });
    }

    const result = await client.query(
      `INSERT INTO deployment_requests (coordinator_id, supervisor_id, batch_label, strand, num_students, notes, direction)
       VALUES ($1, $2, $3, $4, $5, $6, 'supervisor_to_coordinator')
       RETURNING id, coordinator_id, supervisor_id, batch_label, strand, num_students, notes, direction, status, created_at`,
      [coordinator_id, supervisorId, batch_label, strand || null, num, notes || null]
    );

    res.status(201).json({ deployment_request: result.rows[0] });
  } catch (err) {
    console.error('createSupervisorRequest error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const createDeploymentRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    const coordinatorId = req.user.id;
    const { supervisor_id, batch_label, strand, notes, student_ids } = req.body;

    if (!supervisor_id || !batch_label || !student_ids || !Array.isArray(student_ids)) {
      return res.status(400).json({ error: 'supervisor_id, batch_label, and student_ids array are required.' });
    }

    const supervisorCheck = await client.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'supervisor'`,
      [supervisor_id]
    );
    if (supervisorCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid supervisor_id.' });
    }

    const uniqueStudentIds = Array.from(new Set(student_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))));
    if (uniqueStudentIds.length === 0) {
      return res.status(400).json({ error: 'At least one student is required.' });
    }

    const studentsCheck = await client.query(
      `SELECT u.id
       FROM users u
       JOIN student_requirement_submissions srs ON srs.user_id = u.id
       WHERE u.role = 'student'
         AND srs.progress = 100
         AND srs.status NOT IN ('Rejected', 'Needs Revision')
         AND u.id = ANY($1::int[])`,
      [uniqueStudentIds]
    );

    if (studentsCheck.rows.length !== uniqueStudentIds.length) {
      return res.status(400).json({ error: 'One or more students have not completed requirements.' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO deployment_requests (coordinator_id, supervisor_id, batch_label, strand, num_students, notes, direction)
       VALUES ($1, $2, $3, $4, $5, $6, 'coordinator_to_supervisor')
       RETURNING id, coordinator_id, supervisor_id, batch_label, strand, num_students, notes, direction, status, created_at`,
      [coordinatorId, supervisor_id, batch_label, strand || null, uniqueStudentIds.length, notes || null]
    );

    const requestId = result.rows[0].id;

    for (const sid of uniqueStudentIds) {
      await client.query(
        `INSERT INTO deployment_request_students (deployment_request_id, student_id) VALUES ($1, $2)`,
        [requestId, sid]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ deployment_request: result.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('createDeploymentRequest error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const getMyDeploymentRequests = async (req, res) => {
  try {
    const coordinatorId = req.user.id;
    const rows = await pool.query(
      `SELECT
          dr.id,
          dr.batch_label,
          dr.strand,
          dr.num_students,
          dr.notes,
          dr.direction,
          dr.status,
          dr.created_at,
          dr.updated_at,
          u.first_name AS supervisor_first_name,
          u.last_name AS supervisor_last_name,
          u.company_name AS supervisor_company,
          COUNT(drs.student_id) AS student_count
       FROM deployment_requests dr
       JOIN users u ON u.id = dr.supervisor_id
       LEFT JOIN deployment_request_students drs ON drs.deployment_request_id = dr.id
       WHERE dr.coordinator_id = $1
       GROUP BY dr.id, u.first_name, u.last_name, u.company_name
       ORDER BY dr.created_at DESC`,
      [coordinatorId]
    );

    res.json({ deployment_requests: rows.rows });
  } catch (err) {
    console.error('getMyDeploymentRequests error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getSupervisorDeploymentRequests = async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const rows = await pool.query(
      `SELECT
          dr.id,
          dr.batch_label,
          dr.strand,
          dr.num_students,
          dr.notes,
          dr.direction,
          dr.status,
          dr.created_at,
          dr.updated_at,
          u.first_name AS coordinator_first_name,
          u.last_name AS coordinator_last_name,
          COUNT(drs.student_id) AS student_count
       FROM deployment_requests dr
       JOIN users u ON u.id = dr.coordinator_id
       LEFT JOIN deployment_request_students drs ON drs.deployment_request_id = dr.id
       WHERE dr.supervisor_id = $1
       GROUP BY dr.id, u.first_name, u.last_name
       ORDER BY dr.created_at DESC`,
      [supervisorId]
    );

    const requestIds = rows.rows.map((r) => r.id);
    let studentsMap = {};

    if (requestIds.length > 0) {
      const studentsRes = await pool.query(
        `SELECT
            drs.deployment_request_id,
            u.id,
            u.student_id,
            u.first_name,
            u.last_name,
            u.email,
            u.strand,
            u.grade_level
         FROM deployment_request_students drs
         JOIN users u ON u.id = drs.student_id
         WHERE drs.deployment_request_id = ANY($1::int[])
         ORDER BY u.last_name, u.first_name`,
        [requestIds]
      );

      for (const s of studentsRes.rows) {
        if (!studentsMap[s.deployment_request_id]) studentsMap[s.deployment_request_id] = [];
        studentsMap[s.deployment_request_id].push(s);
      }
    }

    const enriched = rows.rows.map((r) => ({
      ...r,
      students: studentsMap[r.id] || [],
    }));

    res.json({ deployment_requests: enriched });
  } catch (err) {
    console.error('getSupervisorDeploymentRequests error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getDeploymentRequestStudents = async (req, res) => {
  try {
    const { requestId } = req.params;
    const requesterId = req.user.id;

    const ownership = await pool.query(
      `SELECT id FROM deployment_requests WHERE id = $1 AND (coordinator_id = $2 OR supervisor_id = $2)`,
      [requestId, requesterId]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const result = await pool.query(
      `SELECT
          u.id,
          u.student_id,
          u.first_name,
          u.last_name,
          u.email,
          u.strand,
          u.grade_level,
          u.phone
       FROM deployment_request_students drs
       JOIN users u ON u.id = drs.student_id
       WHERE drs.deployment_request_id = $1
       ORDER BY u.last_name, u.first_name`,
      [requestId]
    );

    res.json({ students: result.rows });
  } catch (err) {
    console.error('getDeploymentRequestStudents error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const approveDeploymentRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    const supervisorId = req.user.id;
    const { requestId } = req.params;

    const ownership = await client.query(
      `SELECT id, status FROM deployment_requests WHERE id = $1 AND supervisor_id = $2`,
      [requestId, supervisorId]
    );
    if (ownership.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found.' });
    }
    if (ownership.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Request already responded to.' });
    }

    const result = await client.query(
      `UPDATE deployment_requests
       SET status = 'approved', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, status, responded_at`,
      [requestId]
    );

    res.json({ deployment_request: result.rows[0] });
  } catch (err) {
    console.error('approveDeploymentRequest error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const rejectDeploymentRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    const supervisorId = req.user.id;
    const { requestId } = req.params;

    const ownership = await client.query(
      `SELECT id, status FROM deployment_requests WHERE id = $1 AND supervisor_id = $2`,
      [requestId, supervisorId]
    );
    if (ownership.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found.' });
    }
    if (ownership.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Request already responded to.' });
    }

    const result = await client.query(
      `UPDATE deployment_requests
       SET status = 'rejected', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, status, responded_at`,
      [requestId]
    );

    res.json({ deployment_request: result.rows[0] });
  } catch (err) {
    console.error('rejectDeploymentRequest error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const deleteDeploymentRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    const coordinatorId = req.user.id;
    const { requestId } = req.params;

    const ownership = await client.query(
      `SELECT id FROM deployment_requests WHERE id = $1 AND coordinator_id = $2`,
      [requestId, coordinatorId]
    );
    if (ownership.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    await client.query('BEGIN');
    await client.query(`DELETE FROM deployment_request_students WHERE deployment_request_id = $1`, [requestId]);
    await client.query(`DELETE FROM deployment_requests WHERE id = $1`, [requestId]);
    await client.query('COMMIT');

    res.json({ message: 'Deployment request deleted.' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('deleteDeploymentRequest error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const fulfillSupervisorRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    const coordinatorId = req.user.id;
    const { requestId } = req.params;
    const { student_ids } = req.body;

    const requestCheck = await client.query(
      `SELECT id, status, num_students, direction FROM deployment_requests WHERE id = $1 AND coordinator_id = $2`,
      [requestId, coordinatorId]
    );
    if (requestCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found.' });
    }
    const reqData = requestCheck.rows[0];
    if (reqData.direction !== 'supervisor_to_coordinator') {
      return res.status(400).json({ error: 'This is not a supervisor request.' });
    }
    if (reqData.status === 'fulfilled') {
      return res.status(400).json({ error: 'Request already fulfilled.' });
    }

    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      return res.status(400).json({ error: 'student_ids array is required.' });
    }

    const uniqueStudentIds = Array.from(new Set(student_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))));

    if (reqData.num_students && uniqueStudentIds.length !== Number(reqData.num_students)) {
      return res.status(400).json({ error: `Expected ${reqData.num_students} students, got ${uniqueStudentIds.length}.` });
    }

    const studentsCheck = await client.query(
      `SELECT u.id
       FROM users u
       JOIN student_requirement_submissions srs ON srs.user_id = u.id
       WHERE u.role = 'student'
         AND srs.progress = 100
         AND srs.status NOT IN ('Rejected', 'Needs Revision')
         AND u.id = ANY($1::int[])`,
      [uniqueStudentIds]
    );

    if (studentsCheck.rows.length !== uniqueStudentIds.length) {
      return res.status(400).json({ error: 'One or more students have not completed requirements.' });
    }

    await client.query('BEGIN');

    for (const sid of uniqueStudentIds) {
      await client.query(
        `INSERT INTO deployment_request_students (deployment_request_id, student_id) VALUES ($1, $2)
         ON CONFLICT (deployment_request_id, student_id) DO NOTHING`,
        [requestId, sid]
      );
    }

    await client.query(
      `UPDATE deployment_requests
       SET status = 'fulfilled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [requestId]
    );

    await client.query('COMMIT');
    res.json({ message: 'Students assigned and request fulfilled.' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('fulfillSupervisorRequest error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};


module.exports = {
  getPendingStudents,
  approveStudent,
  disapproveStudent,
  upsertRequirements,
  submitRequirements,
  getRequirements,
  uploadDocument,
  deleteDocument,
  listSubmissions,
  reviewSubmission,
  verifyDocument,
  createTeacherBatch,
  updateTeacherBatch,
  deleteTeacherBatch,
  assignApprovedStudentsToBatch,
  getMyTeacherBatches,
  getTeacherBatchStudents,
  getTeachersListForCoordinator,
  getSupervisorsListForCoordinator,
  getCoordinatorBatchesWithAssignedStudents,
  getRequirementCompletedStudentsForCoordinator,
  createSupervisorRequest,
  createDeploymentRequest,
  getMyDeploymentRequests,
  getSupervisorDeploymentRequests,
  getDeploymentRequestStudents,
  approveDeploymentRequest,
  rejectDeploymentRequest,
  deleteDeploymentRequest, 
  fulfillSupervisorRequest,
};