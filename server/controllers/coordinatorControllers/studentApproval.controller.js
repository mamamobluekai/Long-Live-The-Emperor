const pool = require('../../db/');
const approvalLink = require('../../services/approvalLink.service');

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

// Mirrors the admin approval flow but without handing out a temp password.
// Approval issues a one-time link instead; the student opens it and chooses
// their own password + confirmation on /set-password?token=..., which the page
// submits to the token-based reset endpoint.
//
// Why a token and not the plain email flow: /api/users/set-password (email only,
// no token) is reserved for 'pending' activation, and this account is already
// 'approved' by the time the mail goes out. The token endpoint is the one that
// can safely set a password for an approved account, because possession of the
// emailed link is the proof.
//
// The link's lifetime is set centrally in utils/linkExpiry.js.

const approveStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE users SET status = 'approved', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'pending' AND role = 'student'
       RETURNING id, email, role, password`,
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

    const { emailSent, linkSent } = await approvalLink.issueAndEmailApprovalLink(user);

    // A student who self-registered already has a password, so they get a plain
    // approval notice. One created by Excel upload has none, so they get the
    // set-password link. Either way the mail is best-effort and the account is
    // approved regardless - so say so explicitly when nothing was delivered.
    res.json({
      message: emailSent
        ? linkSent
          ? 'Student approved. Set-your-password link emailed.'
          : 'Student approved. Approval email sent.'
        : 'Student approved, but the email failed to send. Use Resend email on their row.',
      emailSent,
      linkSent,
      user: approvalLink.publicUser(user),
    });
  } catch (err) {
    console.error('Approve student error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// Recovery path when the approval mail bounced or expired. Issues a fresh
// one-time token, which also invalidates the previous link.
const resendStudentApprovalLink = async (req, res) => {
  try {
    const { id } = req.params;
    const recipient = await approvalLink.getApprovalRecipient(Number(id));
    if (!recipient || recipient.role !== 'student') {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const { emailSent } = await approvalLink.resendApprovalLink(recipient);
    res.json({
      message: emailSent
        ? 'Set-your-password link emailed.'
        : 'The email failed to send. Check the mail settings and try again.',
      emailSent,
    });
  } catch (err) {
    console.error('Resend student approval link error:', err);
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

    // Invalidates any set-password link already mailed to this student.
    await approvalLink.revokeApprovalTokens(user.id);

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

    // The approved rows are collected in the same transaction so the mails go
    // out only for students that were actually flipped to approved.
    const approvedIds = result.rows.map((r) => r.id);

    // Approving in bulk used to send nothing, which left every one of those
    // students unable to sign in: their account was active but they had no
    // password and no way to get one. Each now gets the same one-time
    // set-password link as a single approval.
    let emailFailures = 0;
    let linksSent = 0;
    if (approvedIds.length > 0) {
      // u.password decides per student whether a set-password link is needed or
      // a plain approval notice is enough (see approvalLink.service).
      const recipients = await client.query(
        `SELECT u.id, u.email, u.role, u.password, s.first_name, s.last_name
         FROM users u
         JOIN students s ON s.user_id = u.id
         WHERE u.id = ANY($1)`,
        [approvedIds],
      );

      // Sequential on purpose: a bulk approve of a full year would otherwise
      // open a burst of SMTP connections and get the sender throttled or
      // temporarily blocked.
      for (const recipient of recipients.rows) {
        // Each student needs a distinct token, so issue individually.
        // eslint-disable-next-line no-await-in-loop
        const { emailSent, linkSent } = await approvalLink.issueAndEmailApprovalLink(recipient);
        if (!emailSent) emailFailures += 1;
        if (linkSent) linksSent += 1;
      }
    }

    const summary = `${approvedIds.length} student(s) approved.`;
    const emailNote = emailFailures
      ? ` ${emailFailures} email(s) failed - resend from the student list.`
      : linksSent
        ? ` ${linksSent} set-password link(s) emailed.`
        : ' Approval emails sent.';

    res.json({
      message: summary + emailNote,
      count: approvedIds.length,
      emailFailures,
      linksSent,
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

    // Drop any outstanding set-password links so a rejected student cannot use
    // one to set a password and get the account re-approved.
    const revokedIds = result.rows.map((r) => r.id);
    if (revokedIds.length > 0) {
      await client.query(
        `DELETE FROM password_reset_tokens WHERE user_id = ANY($1)`,
        [revokedIds],
      );
    }

    res.json({
      message: `${revokedIds.length} student(s) disapproved.`,
      count: revokedIds.length,
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
  resendStudentApprovalLink,
  deleteStudent,
  bulkApproveStudents,
  bulkDisapproveStudents,
  bulkDeleteStudents,
};