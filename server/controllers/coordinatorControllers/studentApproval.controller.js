const pool = require('../../db/');
const { hashPassword } = require('../../utils/hashPassword');
const { generateTemporaryPassword } = require('../../utils/generatePassword');
const { sendStudentApprovalEmail } = require('./regexes/email');

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

    const studentResult = await pool.query(
      `SELECT first_name, last_name FROM students WHERE user_id = $1`,
      [id]
    );

    const user = result.rows[0];
    if (studentResult.rows.length > 0) {
      user.first_name = studentResult.rows[0].first_name;
      user.last_name = studentResult.rows[0].last_name;
    }

    // Create a temporary password and set it as the student's password so they
    // can log in immediately after approval.
    const tempPassword = generateTemporaryPassword();
    await pool.query(
      `UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [await hashPassword(tempPassword), id]
    );

    await sendStudentApprovalEmail(user, tempPassword);

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

module.exports = {
  getPendingStudents,
  approveStudent,
  disapproveStudent,
};