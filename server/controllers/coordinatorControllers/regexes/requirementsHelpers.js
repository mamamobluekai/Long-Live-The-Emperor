const { requiredInfoFields } = require('../helpers/constant');
const { normalize } = require('./validation');

/**
 * Load the active requirement definitions.
 * These live in the `document_types` table so coordinators can add, edit, or
 * remove requirements without a code change.
 */
const getActiveDocumentTypes = async (client) => {
  const result = await client.query(
    `SELECT id, code, name, section, sort_order
     FROM document_types
     WHERE is_active = TRUE
     ORDER BY sort_order, id`
  );
  return result.rows;
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
     WHERE sd.student_id = $1 AND dt.is_active = TRUE`,
    [studentId]
  );
  const uploadedCodes = new Set(docs.rows.map((row) => row.code));

  // Active requirements drive completeness, so adding/removing a requirement
  // immediately re-evaluates every student's progress.
  const activeTypes = await getActiveDocumentTypes(client);
  const codesForSection = (section) =>
    activeTypes.filter((type) => type.section === section).map((type) => type.code);

  const personalComplete = requiredInfoFields
    .filter((field) => !field.startsWith('guardian_') && !field.startsWith('emergency_'))
    .every((field) => normalize(student[field]));

  const guardianComplete = [
    'guardian_name', 'guardian_relationship', 'guardian_contact', 'guardian_email',
    'guardian_address', 'emergency_contact', 'emergency_contact_number',
  ].every((field) => normalize(student[field]))
    && codesForSection('guardian').every((code) => uploadedCodes.has(code));

  const medicalComplete = codesForSection('medical').every((code) => uploadedCodes.has(code));
  const academicComplete = codesForSection('academic').every((code) => uploadedCodes.has(code));

  const sections = { personalComplete, guardianComplete, medicalComplete, academicComplete };
  const progress = Object.values(sections).filter(Boolean).length * 25;
  await client.query(
    `UPDATE student_requirement_submissions SET progress = $1, updated_at = CURRENT_TIMESTAMP WHERE student_id = $2`,
    [progress, studentId]
  );

  const missingDocuments = activeTypes
    .map((type) => type.code)
    .filter((code) => !uploadedCodes.has(code));

  return { progress, sections, missingDocuments };
};

/**
 * Recalculate progress for every student. Called after a coordinator changes
 * the requirement definitions so all dashboards stay consistent.
 */
const recalculateAllProgress = async (client) => {
  const students = await client.query('SELECT id FROM students');
  for (const row of students.rows) {
    await calculateProgress(client, row.id);
  }
  return students.rows.length;
};

const serializeRequirements = async (client, studentId) => {
  const student = await client.query('SELECT * FROM students WHERE id = $1', [studentId]);
  const submission = await client.query(
    `SELECT s.*,
            COALESCE(t.first_name || ' ' || t.last_name,
                     sv.first_name || ' ' || sv.last_name,
                     c.first_name || ' ' || c.last_name,
                     a.first_name || ' ' || a.last_name,
                     st.first_name || ' ' || st.last_name) AS reviewed_by_name
     FROM student_requirement_submissions s
     LEFT JOIN teachers t ON t.user_id = s.reviewed_by
     LEFT JOIN supervisors sv ON sv.user_id = s.reviewed_by
     LEFT JOIN coordinators c ON c.user_id = s.reviewed_by
     LEFT JOIN admins a ON a.user_id = s.reviewed_by
     LEFT JOIN students st ON st.user_id = s.reviewed_by
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
    `SELECT sl.*,
            COALESCE(t.first_name || ' ' || t.last_name,
                     sv.first_name || ' ' || sv.last_name,
                     c.first_name || ' ' || c.last_name,
                     a.first_name || ' ' || a.last_name,
                     st.first_name || ' ' || st.last_name) AS actor_name
     FROM submission_logs sl
     LEFT JOIN teachers t ON t.user_id = sl.actor_id
     LEFT JOIN supervisors sv ON sv.user_id = sl.actor_id
     LEFT JOIN coordinators c ON c.user_id = sl.actor_id
     LEFT JOIN admins a ON a.user_id = sl.actor_id
     LEFT JOIN students st ON st.user_id = sl.actor_id
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
  getActiveDocumentTypes,
  calculateProgress,
  recalculateAllProgress,
  serializeRequirements,
};