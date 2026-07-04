const { requiredInfoFields, requiredDocumentCodes } = require('../helpers/constant');
const { normalize } = require('./validation');

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

module.exports = {
  getOrCreateStudent,
  getOrCreateSubmission,
  calculateProgress,
  serializeRequirements,
};