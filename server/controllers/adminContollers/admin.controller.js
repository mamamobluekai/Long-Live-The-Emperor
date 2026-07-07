const multer = require('multer');
const nodemailer = require('nodemailer');
const pool = require('../../db');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((err) => {
  if (err) {
    console.error('Email transporter verification failed:', err.message);
  } else {
    console.log('Email transporter ready.');
  }
});

function getClientUrl() {
  return process.env.CLIENT_URL || 'http://localhost:5173';
}

const ROLE_LABELS = {
  teacher: 'Teacher',
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
  student: 'Student',
  admin: 'Admin',
};

async function sendApprovalEmail(user, approvedByLabel) {
  const roleLabel = ROLE_LABELS[user.role] || user.role;
  try {
    await transporter.sendMail({
      from: `"Work Immersion System" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `Your Work Immersion ${roleLabel} Account is Approved - Set Your Password`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2a5298;">Account Approved</h2>
          <p>Hello <strong>${user.first_name} ${user.last_name}</strong>,</p>
          <p>Your ${roleLabel} account has been approved by the administrator. Please set your password to complete your account setup.</p>
          <p><strong>Email:</strong> ${user.email}</p>
          <p style="margin: 20px 0;">
            <a href="${getClientUrl()}/set-password?email=${encodeURIComponent(user.email)}" style="background: #2a5298; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Set Your Password
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

const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.status, u.created_at,
              COALESCE(s.first_name, t.first_name, a.first_name, sup.first_name, c.first_name, '') as first_name,
              COALESCE(s.last_name, t.last_name, a.last_name, sup.last_name, c.last_name, '') as last_name,
              COALESCE(s.student_number, t.employee_id, a.employee_id, sup.employee_id, c.employee_id, '') as identifier
       FROM users u
       LEFT JOIN students s ON u.id = s.user_id AND u.role = 'student'
       LEFT JOIN teachers t ON u.id = t.user_id AND u.role = 'teacher'
       LEFT JOIN admins a ON u.id = a.user_id AND u.role = 'admin'
       LEFT JOIN supervisors sup ON u.id = sup.user_id AND u.role = 'supervisor'
       LEFT JOIN coordinators c ON u.id = c.user_id AND u.role = 'coordinator'
       ORDER BY u.created_at DESC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getCoordinators = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.status, c.first_name, c.last_name, c.department, u.created_at
       FROM users u
       JOIN coordinators c ON u.id = c.user_id
       WHERE u.status = 'approved'
       ORDER BY c.first_name, c.last_name`
    );
    res.json({ coordinators: result.rows });
  } catch (err) {
    console.error('Get coordinators error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getUsersByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.status, u.created_at,
              COALESCE(s.first_name, t.first_name, a.first_name, sup.first_name, c.first_name, '') as first_name,
              COALESCE(s.last_name, t.last_name, a.last_name, sup.last_name, c.last_name, '') as last_name,
              COALESCE(s.student_number, t.employee_id, a.employee_id, sup.employee_id, c.employee_id, '') as identifier
       FROM users u
       LEFT JOIN students s ON u.id = s.user_id AND u.role = 'student'
       LEFT JOIN teachers t ON u.id = t.user_id AND u.role = 'teacher'
       LEFT JOIN admins a ON u.id = a.user_id AND u.role = 'admin'
       LEFT JOIN supervisors sup ON u.id = sup.user_id AND u.role = 'supervisor'
       LEFT JOIN coordinators c ON u.id = c.user_id AND u.role = 'coordinator'
       WHERE u.status = $1
       ORDER BY u.created_at DESC`,
      [status]
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Get users by status error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const approveStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE users SET status = 'approved', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'pending' AND role IN ('teacher', 'supervisor', 'coordinator')
       RETURNING id, email, role`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found, already processed, or not a teacher/supervisor/coordinator.',
      });
    }

    const user = result.rows[0];
    
    // Fetch role-specific data to get first_name and last_name
    let roleData = {};
    if (user.role === 'teacher') {
      const roleResult = await pool.query(
        `SELECT first_name, last_name FROM teachers WHERE user_id = $1`,
        [id]
      );
      roleData = roleResult.rows[0] || {};
    } else if (user.role === 'supervisor') {
      const roleResult = await pool.query(
        `SELECT first_name, last_name FROM supervisors WHERE user_id = $1`,
        [id]
      );
      roleData = roleResult.rows[0] || {};
    } else if (user.role === 'coordinator') {
      const roleResult = await pool.query(
        `SELECT first_name, last_name FROM coordinators WHERE user_id = $1`,
        [id]
      );
      roleData = roleResult.rows[0] || {};
    }
    
    const userWithNames = { ...user, ...roleData };
    await sendApprovalEmail(userWithNames, 'admin');

    res.json({ message: `${ROLE_LABELS[user.role]} approved.`, user: userWithNames });
  } catch (err) {
    console.error('Approve staff error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const disapproveStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE users SET status = 'disapproved', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'pending' AND role IN ('teacher', 'supervisor', 'coordinator')
       RETURNING id, email, role`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found, already processed, or not a teacher/supervisor/coordinator.',
      });
    }

    const user = result.rows[0];
    
    // Fetch role-specific data to get first_name and last_name
    let roleData = {};
    if (user.role === 'teacher') {
      const roleResult = await pool.query(
        `SELECT first_name, last_name FROM teachers WHERE user_id = $1`,
        [id]
      );
      roleData = roleResult.rows[0] || {};
    } else if (user.role === 'supervisor') {
      const roleResult = await pool.query(
        `SELECT first_name, last_name FROM supervisors WHERE user_id = $1`,
        [id]
      );
      roleData = roleResult.rows[0] || {};
    } else if (user.role === 'coordinator') {
      const roleResult = await pool.query(
        `SELECT first_name, last_name FROM coordinators WHERE user_id = $1`,
        [id]
      );
      roleData = roleResult.rows[0] || {};
    }
    
    const userWithNames = { ...user, ...roleData };
    res.json({ message: `${ROLE_LABELS[user.role]} disapproved.`, user: userWithNames });
  } catch (err) {
    console.error('Disapprove staff error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete from tables that reference students
      await client.query('DELETE FROM teacher_batch_students WHERE student_id IN (SELECT id FROM students WHERE user_id = $1)', [id]);
      await client.query('DELETE FROM deployment_request_students WHERE student_id IN (SELECT id FROM students WHERE user_id = $1)', [id]);
      await client.query('DELETE FROM student_documents WHERE student_id IN (SELECT id FROM students WHERE user_id = $1)', [id]);
      
      // Delete from teacher batches and deployment requests
      await client.query('DELETE FROM teacher_batches WHERE coordinator_id IN (SELECT id FROM coordinators WHERE user_id = $1) OR teacher_id IN (SELECT id FROM teachers WHERE user_id = $1)', [id]);
      await client.query('DELETE FROM student_requirement_submissions WHERE student_id IN (SELECT id FROM students WHERE user_id = $1) OR reviewed_by = $1', [id]);
      await client.query('DELETE FROM submission_logs WHERE actor_id = $1', [id]);
      await client.query('DELETE FROM deployment_requests WHERE coordinator_id IN (SELECT id FROM coordinators WHERE user_id = $1) OR supervisor_id IN (SELECT id FROM supervisors WHERE user_id = $1)', [id]);
      
      // Delete from role-specific tables
      await client.query('DELETE FROM students WHERE user_id = $1', [id]);
      await client.query('DELETE FROM teachers WHERE user_id = $1', [id]);
      await client.query('DELETE FROM admins WHERE user_id = $1', [id]);
      await client.query('DELETE FROM supervisors WHERE user_id = $1', [id]);
      await client.query('DELETE FROM coordinators WHERE user_id = $1', [id]);
      
      // Finally delete from users table
      const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found.' });
      }
      await client.query('COMMIT');
      res.json({ message: 'User deleted.' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = {
  getAllUsers,
  getCoordinators,
  getUsersByStatus,
  approveStaff,
  disapproveStaff,
  deleteUser,
};
