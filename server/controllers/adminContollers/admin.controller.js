const pool = require('../../db');
const path = require('path');
const cloudinary = require('../../db/cloudinary');
const streamifier = require('streamifier');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const { hashPassword } = require('../../utils/hashPassword');
const { generateTemporaryPassword } = require('../../utils/generatePassword');
const { login } = require('../user.controller');
const adminService = require('../../services/admin.service');

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

async function sendApprovalEmail(user, approvedByLabel, tempPassword) {
  const roleLabel = ROLE_LABELS[user.role] || user.role;
  try {
    await transporter.sendMail({
      from: `"Work Immersion System" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `Your Work Immersion ${roleLabel} Account is Approved`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2a5298;">Account Approved</h2>
          <p>Hello <strong>${user.first_name} ${user.last_name}</strong>,</p>
          <p>Your ${roleLabel} account has been approved by the administrator. A temporary password was created for you so you can log in right away.</p>
          <p><strong>Email:</strong> ${user.email}</p>
          <p style="margin: 16px 0;">
            <strong>Temporary password:</strong>
            <code style="display: inline-block; background: #f1f5f9; padding: 8px 12px; border-radius: 5px; font-size: 16px; letter-spacing: 1px;">${tempPassword}</code>
          </p>
          <p style="margin: 20px 0;">
            <a href="${getClientUrl()}/login" style="background: #2a5298; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Log In
            </a>
          </p>
          <p style="color: #666; font-size: 12px;">For your security, please change this password after logging in.</p>
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
    const { search, role, status, page, limit } = req.query;
    const result = await adminService.getUsers({
      search: search || '',
      role: role || '',
      status: status || '',
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
    res.json(result);
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

async function ensureAdminTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      system_name VARCHAR(255) NOT NULL DEFAULT 'Work Immersion Monitoring System',
      logo_url TEXT,
      school_name VARCHAR(255),
      school_address TEXT,
      academic_year VARCHAR(50),
      semester VARCHAR(50),
      attendance_time_in TIME DEFAULT '08:00',
      attendance_time_out TIME DEFAULT '17:00',
      announcements TEXT,
      updated_by INTEGER REFERENCES users(id),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT one_settings_row CHECK (id = 1)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL,
      details TEXT,
      ip_address VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'info',
      is_read BOOLEAN NOT NULL DEFAULT false,
      action_url TEXT,
      related_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      evaluator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      evaluation_type VARCHAR(100) NOT NULL,
      rating INTEGER CHECK (rating BETWEEN 1 AND 10),
      comments TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE admins ADD COLUMN IF NOT EXISTS photo_url VARCHAR(512);

    INSERT INTO system_settings (id, system_name)
      SELECT 1, 'Work Immersion Monitoring System'
      WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE id = 1);
  `);
}

async function writeAuditLog(req, action, details = '', module = '', status = 'success', device = '') {
  try {
    await ensureAdminTables();
    const userId = req && req.user ? req.user.id : null;
    const ipAddress = req && req.ip ? req.ip : null;
    const userAgent = req && req.headers ? req.headers['user-agent'] || '' : '';
    const finalDevice = device || userAgent;
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, details, module, status, device, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, action, details, module, status, finalDevice, ipAddress]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

function uploadBufferToCloudinary(buffer, resourceType, originalName) {
  return new Promise((resolve, reject) => {
    const options = {
      resource_type: resourceType,
      folder: 'admin_uploads',
      use_filename: true,
      unique_filename: true,
    };

    const stream = cloudinary.uploader.upload_stream(
      options,
      (err, result) => (err ? reject(err) : resolve(result))
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

function sendCsv(res, filename, rows) {
  const headers = rows.length ? Object.keys(rows[0]) : ['message'];
  const bodyRows = rows.length ? rows : [{ message: 'No records found' }];
  const csv = [
    headers.join(','),
    ...bodyRows.map((row) => headers.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send(csv);
}

function sendExcel(res, filename, rows) {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ message: 'No records found' }]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  res.send(buffer);
}

function sendPdf(res, filename, rows, title) {
  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);
  doc.fontSize(16).text(title, { underline: true });
  doc.moveDown();
  (rows.length ? rows : [{ message: 'No records found' }]).forEach((row) => {
    doc.fontSize(9).text(Object.entries(row).map(([key, value]) => `${key}: ${value ?? ''}`).join(' | '));
    doc.moveDown(0.4);
  });
  doc.end();
}

const createAdmin = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      employeeId,
      department,
      phone,
    } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'First name, last name, email, and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const trimmedEmail = String(email).trim();
    const trimmedEmployeeId = employeeId ? String(employeeId).trim() : null;

    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [trimmedEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    if (trimmedEmployeeId) {
      const existingAdmin = await client.query('SELECT id FROM admins WHERE employee_id = $1', [trimmedEmployeeId]);
      if (existingAdmin.rows.length > 0) {
        return res.status(409).json({ error: 'Employee ID already registered.' });
      }
    }

    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (email, password, role, phone, status)
       VALUES ($1, $2, 'admin', $3, 'approved')
       RETURNING id, email, role, status, phone, created_at`,
      [trimmedEmail, await hashPassword(password), phone ? String(phone).trim() : null]
    );

    const user = userResult.rows[0];
    await client.query(
      `INSERT INTO admins (user_id, first_name, last_name, employee_id, department)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        String(firstName).trim(),
        String(lastName).trim(),
        trimmedEmployeeId,
        department ? String(department).trim() : null,
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Admin user created.',
      user: {
        ...user,
        first_name: String(firstName).trim(),
        last_name: String(lastName).trim(),
        identifier: trimmedEmployeeId || '',
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create admin error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
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

    // Create a temporary password and set it as the user's password so they
    // can log in immediately after approval.
    const tempPassword = generateTemporaryPassword();
    await pool.query(
      `UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [await hashPassword(tempPassword), id]
    );

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
    await sendApprovalEmail(userWithNames, 'admin', tempPassword);

    await writeAuditLog(req, 'account_approval', `${ROLE_LABELS[user.role]} ${userWithNames.first_name || ''} ${userWithNames.last_name || ''} (${user.email}) approved`);
    await writeAuditLog(req, 'password_reset', `Temporary password generated for ${user.email} on approval`);

    res.json({ message: `${ROLE_LABELS[user.role]} approved.`, user: userWithNames, tempPassword });
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
    await writeAuditLog(req, 'account_rejection', `${ROLE_LABELS[user.role]} ${userWithNames.first_name || ''} ${userWithNames.last_name || ''} (${user.email}) disapproved`);
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
      await client.query('DELETE FROM teacher_batch_students WHERE student_id = $1', [id]);
      await client.query('DELETE FROM deployment_request_students WHERE student_id = $1', [id]);
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
      await writeAuditLog(req, 'account_deletion', `Deleted user ${id}`);
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

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await adminService.getUserById(Number(id));
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await adminService.updateUser(Number(id), req.body);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    await writeAuditLog(req, 'user_update', `Updated user ${user.id}`);
    res.json({ user });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    const result = await adminService.resetUserPassword(Number(id), password);
    if (!result) {
      return res.status(404).json({ error: 'User not found.' });
    }
    await writeAuditLog(req, 'password_reset', `Password reset for user ${id}`);
    const isTemps = !password;
    res.json({
      message: isTemps
        ? 'Password reset successfully. A temporary password has been generated.'
        : 'Password reset successfully.',
      tempPassword: isTemps ? result.tempPassword : undefined,
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status) {
      return res.status(400).json({ error: 'Status is required.' });
    }
    const user = await adminService.updateUser(Number(id), { status });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const action = status === 'approved' ? 'account_activation' : status === 'disapproved' ? 'account_rejection' : 'account_status_change';
    await writeAuditLog(req, action, `Set user ${id} status to ${status}`);
    res.json({ message: `User status updated to ${status}.`, user });
  } catch (err) {
    console.error('Update user status error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const listPendingCoordinators = async (req, res) => {
  try {
    const coordinators = await adminService.getPendingCoordinators();
    res.json({ coordinators });
  } catch (err) {
    console.error('Pending coordinators error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const approveCoordinator = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.approveCoordinator(Number(id));
    if (!result) {
      return res.status(404).json({ error: 'Pending coordinator not found.' });
    }
    const fullName = `${result.profile.first_name || ''} ${result.profile.last_name || ''}`.trim() || result.user.email;
    await sendApprovalEmail(
      { ...result.user, first_name: result.profile.first_name, last_name: result.profile.last_name, role: 'coordinator' },
      'admin',
      result.tempPassword
    );
    await writeAuditLog(req, 'coordinator_approval', `Approved coordinator ${fullName}`);
    res.json({ message: 'Coordinator approved.', tempPassword: result.tempPassword, user: result.user, profile: result.profile });
  } catch (err) {
    console.error('Approve coordinator error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const rejectCoordinator = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.rejectCoordinator(Number(id));
    if (!result) {
      return res.status(404).json({ error: 'Pending coordinator not found.' });
    }
    const fullName = `${result.profile.first_name || ''} ${result.profile.last_name || ''}`.trim() || result.user.email;
    await writeAuditLog(req, 'coordinator_rejection', `Rejected coordinator ${fullName}`);
    res.json({ message: 'Coordinator rejected.', user: result.user, profile: result.profile });
  } catch (err) {
    console.error('Reject coordinator error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const result = await adminService.updateAdminPassword(req.user.id, currentPassword, newPassword);
    if (!result) {
      return res.status(404).json({ error: 'Admin user not found.' });
    }

    await writeAuditLog(req, 'password_change', 'Admin changed their password');
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    if (err.message === 'Current password is incorrect') {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    console.error('Update password error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    const result = await uploadBufferToCloudinary(req.file.buffer, 'image', req.file.originalname);
    await pool.query(
      `UPDATE admins SET photo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
      [result.secure_url, req.user.id]
    );
    await writeAuditLog(req, 'profile_photo_update', 'Admin updated profile picture');
    res.json({ message: 'Profile picture uploaded successfully.', photoUrl: result.secure_url });
  } catch (err) {
    console.error('Upload profile picture error:', err);
    res.status(500).json({ error: 'Server error during upload.' });
  }
};

const getSettings = async (req, res) => {
  try {
    const settings = await adminService.getSettings();
    if (!settings) {
      return res.status(404).json({ error: 'Settings not found.' });
    }
    res.json({ settings });
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const updateSettings = async (req, res) => {
  try {
    await adminService.ensureAdminTables();
    const settings = await adminService.updateSettings(req.body, req.user.id);
    await writeAuditLog(req, 'settings_change', `System settings updated`);
    res.json({ settings });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    await adminService.ensureAdminTables();
    const uploadResult = await uploadBufferToCloudinary(req.file.buffer, 'image', req.file.originalname);
    await pool.query(
      `UPDATE system_settings SET logo_url = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
      [uploadResult.secure_url, req.user.id]
    );
    await writeAuditLog(req, 'settings_change', `System logo uploaded`);
    res.json({ message: 'Logo uploaded successfully.', logoUrl: uploadResult.secure_url });
  } catch (err) {
    console.error('Upload logo error:', err);
    res.status(500).json({ error: 'Server error during logo upload.' });
  }
};

const getLogs = async (req, res) => {
  try {
    const { page, limit, action, role, status, module, search, dateFrom, dateTo, format } = req.query;
    const filters = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      action: action || '',
      role: role || '',
      status: status || '',
      module: module || '',
      search: search || '',
      dateFrom: dateFrom || '',
      dateTo: dateTo || '',
    };

    if (format === 'csv' || format === 'xlsx' || format === 'pdf') {
      const rows = await adminService.getLogsForExport(filters);
      const filename = `access_logs_${new Date().toISOString().slice(0, 10)}`;
      if (format === 'csv') return sendCsv(res, filename, rows);
      if (format === 'xlsx') return sendExcel(res, filename, rows);
      if (format === 'pdf') return sendPdf(res, filename, rows, 'Access Logs Report');
    }

    const result = await adminService.getLogs(filters);
    res.json(result);
  } catch (err) {
    console.error('Get logs error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getNotifications = async (req, res) => {
  try {
    await adminService.ensureAdminTables();
    await adminService.ensureCoordinatorRegistrationNotifications(req.user.id);
    const notifications = await adminService.getNotifications(req.user.id);
    res.json({ notifications });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const markNotificationsRead = async (req, res) => {
  try {
    await adminService.markNotificationsRead(req.user.id);
    await writeAuditLog(req, 'notifications_read', 'Marked admin notifications as read');
    res.json({ message: 'Notifications marked as read.' });
  } catch (err) {
    console.error('Mark notifications read error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getReport = async (req, res) => {
  try {
    const { type } = req.params;
    const { format = 'json' } = req.query;
    const rows = await adminService.getReport(type);

    if (format === 'csv') {
      return sendCsv(res, `${type}_report`, rows);
    }
    if (format === 'xlsx') {
      return sendExcel(res, `${type}_report`, rows);
    }
    if (format === 'pdf') {
      return sendPdf(res, `${type}_report`, rows, `${type.charAt(0).toUpperCase() + type.slice(1)} Report`);
    }

    await writeAuditLog(req, 'report_view', `Viewed ${type} report`);
    res.json({ report: rows, count: rows.length });
  } catch (err) {
    console.error('Get report error:', err);
    if (err.message === 'Unknown report type') {
      return res.status(400).json({ error: 'Unknown report type.' });
    }
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = {
  getAllUsers,
  getCoordinators,
  getUsersByStatus,
  createAdmin,
  approveStaff,
  disapproveStaff,
  deleteUser,
  getUserById,
  updateUser,
  updateUserStatus,
  resetUserPassword,
  updatePassword,
  uploadProfilePicture,
  listPendingCoordinators,
  approveCoordinator,
  rejectCoordinator,
  getSettings,
  updateSettings,
  getLogs,
  getNotifications,
  markNotificationsRead,
  getReport,
  writeAuditLog,
  ensureAdminTables,
  uploadLogo,
  sendCsv,
  sendExcel,
  sendPdf,
};
