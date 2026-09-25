const pool = require('../../db/');
const { sendStudentApprovalEmail } = require('./regexes/email');

const getPendingStudents = async (req, res) => {
  try {
    const { status, strand } = req.query;

    let whereClause = `WHERE u.role = 'student'`;
    const params = [];
    let paramIdx = 1;

    if (status && status !== 'all') {
      whereClause += ` AND u.status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    if (strand && strand !== 'all') {
      whereClause += ` AND s.track_strand = $${paramIdx}`;
      params.push(strand);
      paramIdx++;
    }

    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.status, u.created_at, s.first_name, s.last_name, s.student_number,
              s.grade_level, s.section, s.track_strand, s.school, s.preferred_company
       FROM users u
       JOIN students s ON u.id = s.user_id
       ${whereClause}
       ORDER BY u.created_at DESC`,
      params
    );
    res.json({ students: result.rows });
  } catch (err) {
    console.error('Get pending students error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getStudentStrands = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT s.track_strand
       FROM users u
       JOIN students s ON u.id = s.user_id
       WHERE u.role = 'student' AND s.track_strand IS NOT NULL
       ORDER BY s.track_strand`,
    );
    res.json({ strands: result.rows.map((r) => r.track_strand) });
  } catch (err) {
    console.error('Get student strands error:', err);
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

    const studentResult = await pool.query(
      `SELECT first_name, last_name FROM students WHERE user_id = $1`,
      [id]
    );

    const user = result.rows[0];
    if (studentResult.rows.length > 0) {
      user.first_name = studentResult.rows[0].first_name;
      user.last_name = studentResult.rows[0].last_name;
    }

    // Preserve the student's existing password for manually registered accounts.
    // The coordinator approval email should simply confirm access is now available.
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

const deleteStudent = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    
    await client.query('BEGIN');
    
    // Check if student exists
    const userResult = await client.query(
      `SELECT id, email, role FROM users WHERE id = $1 AND role = 'student'`,
      [id]
    );
    
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Student not found.' });
    }
    
    const studentId = userResult.rows[0].id;
    
    // Delete related records first (cascade order matters)
    // 1. Delete student documents
    await client.query(`DELETE FROM student_documents WHERE student_id = (SELECT id FROM students WHERE user_id = $1)`, [studentId]);
    
    // 2. Delete student daily documentation
    await client.query(`DELETE FROM student_daily_documentation WHERE student_id = (SELECT id FROM students WHERE user_id = $1)`, [studentId]);
    
    // 3. Delete student attendance
    await client.query(`DELETE FROM student_attendance WHERE student_id = (SELECT id FROM students WHERE user_id = $1)`, [studentId]);
    
    // 4. Delete student requirement submissions
    await client.query(`DELETE FROM student_requirement_submissions WHERE student_id = (SELECT id FROM students WHERE user_id = $1)`, [studentId]);
    
    // 5. Delete from teacher_batch_students
    await client.query(`DELETE FROM teacher_batch_students WHERE student_id = (SELECT id FROM students WHERE user_id = $1)`, [studentId]);
    
    // 6. Delete from students table
    await client.query(`DELETE FROM students WHERE user_id = $1`, [studentId]);
    
    // 7. Finally delete the user
    await client.query(`DELETE FROM users WHERE id = $1 AND role = 'student'`, [id]);
    
    await client.query('COMMIT');
    
    res.json({ message: 'Student deleted successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete student error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const bulkApproveStudents = async (req, res) => {
  const { student_ids } = req.body;
  if (!Array.isArray(student_ids) || student_ids.length === 0) {
    return res.status(400).json({ error: 'No student IDs provided.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE users
       SET status = 'approved', updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1) AND role = 'student'
       RETURNING id`,
      [student_ids],
    );

    await client.query(
      `INSERT INTO submission_logs (submission_id, actor_id, action, remarks)
       SELECT srs.id, $2, 'Approved', 'Bulk approval by coordinator.'
       FROM student_requirement_submissions srs
       JOIN students s ON s.user_id = srs.student_id
       WHERE s.user_id = ANY($1)`,
      [result.rows.map((r) => r.id), req.user.id],
    );

    await client.query('COMMIT');

    res.json({
      message: `${result.rows.length} student(s) approved.`,
      count: result.rows.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk approve students error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const bulkDisapproveStudents = async (req, res) => {
  const { student_ids } = req.body;
  if (!Array.isArray(student_ids) || student_ids.length === 0) {
    return res.status(400).json({ error: 'No student IDs provided.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE users
       SET status = 'disapproved', updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1) AND role = 'student'
       RETURNING id`,
      [student_ids],
    );

    await client.query('COMMIT');

    res.json({
      message: `${result.rows.length} student(s) disapproved.`,
      count: result.rows.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk disapprove students error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const bulkDeleteStudents = async (req, res) => {
  const { student_ids } = req.body;
  if (!Array.isArray(student_ids) || student_ids.length === 0) {
    return res.status(400).json({ error: 'No student IDs provided.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM student_documents WHERE student_id IN (SELECT id FROM students WHERE user_id = ANY($1))`,
      [student_ids],
    );

    await client.query(
      `DELETE FROM student_daily_documentation WHERE student_id IN (SELECT id FROM students WHERE user_id = ANY($1))`,
      [student_ids],
    );

    await client.query(
      `DELETE FROM student_attendance WHERE student_id IN (SELECT id FROM students WHERE user_id = ANY($1))`,
      [student_ids],
    );

    await client.query(
      `DELETE FROM student_requirement_submissions WHERE student_id IN (SELECT id FROM students WHERE user_id = ANY($1))`,
      [student_ids],
    );

    await client.query(
      `DELETE FROM teacher_batch_students WHERE student_id IN (SELECT id FROM students WHERE user_id = ANY($1))`,
      [student_ids],
    );

    await client.query(
      `DELETE FROM students WHERE user_id = ANY($1)`,
      [student_ids],
    );

    const result = await client.query(
      `DELETE FROM users WHERE id = ANY($1) AND role = 'student'
       RETURNING id`,
      [student_ids],
    );

    await client.query('COMMIT');

    res.json({
      message: `${result.rows.length} student(s) deleted.`,
      count: result.rows.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk delete students error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

module.exports = {
  getPendingStudents,
  getStudentStrands,
  approveStudent,
  disapproveStudent,
  deleteStudent,
  bulkApproveStudents,
  bulkDisapproveStudents,
  bulkDeleteStudents,
};