const pool = require('../../db');
const path = require('path');
const cloudinary = require('../../db/cloudinary');
const streamifier = require('streamifier');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const { hashPassword } = require('../../utils/hashPassword');
const { validatePassword, validateConfirmation } = require('../../utils/passwordPolicy');
const { generateTemporaryPassword } = require('../../utils/generatePassword');
const { login } = require('../user.controller');
const adminService = require('../../services/admin.service');
const periodArchiveService = require('../../services/periodArchive.service');
const approvalLink = require('../../services/approvalLink.service');

// Token issuing, revocation and the approval email all live in one service so
// every route below behaves the same way. See services/approvalLink.service.js.
const { ROLE_LABELS } = approvalLink;

// Every approval route below uses approvalLink.issueAndEmailApprovalLink() to
// mail a fresh one-time "set your password" link, and
// approvalLink.revokeApprovalTokens() to invalidate outstanding links when an
// account is deactivated.

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

// The profile name for an account, read from whichever role table holds it.
// Used for the greeting line in the approval email.
async function loadRoleNames(userId, role, client = pool) {
  const table = {
    student: 'students',
    teacher: 'teachers',
    supervisor: 'supervisors',
    coordinator: 'coordinators',
    admin: 'admins',
  }[role];

  if (!table) return {};

  const result = await client.query(
    `SELECT first_name, last_name FROM ${table} WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] || {};
}

const approveStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE users SET status = 'approved', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'pending' AND role IN ('teacher', 'supervisor', 'coordinator')
       RETURNING id, email, role, password`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found, already processed, or not a teacher/supervisor/coordinator.',
      });
    }

    const user = result.rows[0];

    // Fetch role-specific data to get first_name and last_name for the greeting.
    const roleData = await loadRoleNames(user.id, user.role);
    const userWithNames = { ...user, ...roleData };

    // Staff created by Excel upload have no password yet, so this mails them a
    // one-time set-password link and they set their own on the linked page.
    const { emailSent } = await approvalLink.issueAndEmailApprovalLink(userWithNames);

    await writeAuditLog(req, 'account_approval', `${ROLE_LABELS[user.role]} ${userWithNames.first_name || ''} ${userWithNames.last_name || ''} (${user.email}) approved`);

    res.json({
      message: emailSent
        ? `${ROLE_LABELS[user.role]} approved. Set-your-password link emailed.`
        : `${ROLE_LABELS[user.role]} approved, but the email failed to send.`,
      emailSent,
      // publicUser strips the password hash that decides link-vs-notice.
      user: approvalLink.publicUser(userWithNames),
    });
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

    // Rejecting invalidates any link already mailed out, otherwise the recipient
    // could still set a password and resetPassword would flip the account back
    // to 'approved'.
    await approvalLink.revokeApprovalTokens(user.id);

    // Fetch role-specific data to get first_name and last_name
    const roleData = await loadRoleNames(user.id, user.role);
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

// The admin's generic status toggle, reached from the "Activate account" button
// in User Management and from the user profile modal.
//
// Approving here has to do what the dedicated approve routes do: the account
// has just become usable, and if it still has no password of its own the only
// way its owner learns that is the mail. Previously this route flipped the
// status and said nothing, so newly approved accounts could not sign in at all.
// Deactivating revokes any outstanding link for the same reason as
// disapproveStaff - resetPassword would otherwise re-approve the account.
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

    let emailSent = null;
    let emailError = null;

    if (status === 'approved') {
      // getApprovalRecipient is a focused query that includes the stored
      // password, so the service can tell a self-registered account (just
      // notify) from an uploaded one (needs a set-password link). Deliberately
      // not read from getUserById: that select feeds list endpoints, so pulling
      // the hash through it would risk leaking it to a client.
      const recipient = await approvalLink.getApprovalRecipient(user.id);
      if (recipient) {
        recipient.first_name = recipient.first_name || user.first_name || '';
        recipient.last_name = recipient.last_name || user.last_name || '';
      }
      ({ emailSent, emailError } = await approvalLink.issueAndEmailApprovalLink(recipient));
    } else if (status === 'disapproved') {
      await approvalLink.revokeApprovalTokens(user.id);
    }

    const roleLabel = ROLE_LABELS[user.role] || 'Account';
    res.json({
      message:
        status === 'approved'
          ? emailSent
            ? `${roleLabel} approved. Approval email sent.`
            : `${roleLabel} approved, but the email failed to send. ${emailError || 'Use Resend link to try again.'}`
          : `User status updated to ${status}.`,
      emailSent,
      emailError,
      user,
    });
  } catch (err) {
    console.error('Update user status error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// Recovery path for an approved account whose mail bounced or expired. Issues a
// brand new one-time token, which also invalidates any previous link.
const resendApprovalLink = async (req, res) => {
  try {
    const { id } = req.params;
    const recipient = await approvalLink.getApprovalRecipient(Number(id));
    if (!recipient) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const { emailSent, emailError } = await approvalLink.resendApprovalLink(recipient);
    await writeAuditLog(
      req,
      'approval_email_resend',
      `Resent set-password link to ${recipient.email}`,
      '',
      emailSent ? 'success' : 'failed',
    );

    res.json({
      message: emailSent
        ? 'Set-your-password link emailed.'
        : `The email failed to send. ${emailError || 'Check the mail settings and try again.'}`,
      emailSent,
      emailError,
    });
  } catch (err) {
    console.error('Resend approval link error:', err);
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
    // Coordinators are created by Excel upload, so they normally have no
    // password yet and get a set-password link; the service call keeps that
    // decision in one place.
    const { emailSent, linkSent } = await approvalLink.issueAndEmailApprovalLink({
      ...result.user,
      first_name: result.profile.first_name,
      last_name: result.profile.last_name,
      role: 'coordinator',
    });
    await writeAuditLog(req, 'coordinator_approval', `Approved coordinator ${fullName}`);
    res.json({
      message: emailSent
        ? linkSent
          ? 'Coordinator approved. Set-your-password link emailed.'
          : 'Coordinator approved. Approval email sent.'
        : 'Coordinator approved, but the email failed to send. Resend from User Management.',
      emailSent,
      linkSent,
      user: approvalLink.publicUser(result.user),
      profile: result.profile,
    });
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
    // A rejection must invalidate any link already issued.
    await approvalLink.revokeApprovalTokens(result.user.id);
    await writeAuditLog(req, 'coordinator_rejection', `Rejected coordinator ${fullName}`);
    res.json({ message: 'Coordinator rejected.', user: result.user, profile: result.profile });
  } catch (err) {
    console.error('Reject coordinator error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    const mismatch = validateConfirmation(newPassword, confirmPassword);
    if (mismatch) {
      return res.status(400).json({ error: mismatch });
    }

    const problem = validatePassword(newPassword);
    if (problem) {
      return res.status(400).json({ error: problem });
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

const setMaintenanceMode = async (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean.' });
  }
  try {
    await adminService.ensureAdminTables();
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : null;
    const estimatedEnd = req.body.estimatedEnd || null;

    await adminService.updateSettings(
      {
        maintenance_mode: enabled,
        maintenance_message: message,
        maintenance_estimated_end: estimatedEnd,
      },
      req.user.id
    );
    // Stamp the start time on enable and clear it on disable so the client can
    // show how long maintenance has been running.
    if (enabled) {
      await adminService.updateSettings({ maintenance_started_at: new Date() }, req.user.id);
    } else {
      await adminService.updateSettings({ maintenance_started_at: null }, req.user.id);
    }

    const status = await adminService.getMaintenanceStatus();
    await writeAuditLog(
      req,
      'maintenance_mode',
      enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled'
    );
    res.json({ maintenance: status });
  } catch (err) {
    console.error('Set maintenance mode error:', err);
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

const deleteLog = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteLog(id);

    if (result.deleted === 0) {
      return res.status(404).json({ error: 'Access log not found.' });
    }

    res.json({ message: 'Access log deleted.', deleted: result.deleted });
  } catch (err) {
    console.error('Delete log error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const deleteLogs = async (req, res) => {
  try {
    const { ids, dateFrom, dateTo } = req.body || {};

    const parsedIds = Array.isArray(ids)
      ? ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];

    if (parsedIds.length === 0 && !dateFrom && !dateTo) {
      return res
        .status(400)
        .json({ error: 'Provide log ids, a date range, or use the clear-all action.' });
    }

    const result = await adminService.deleteLogs({
      ids: parsedIds,
      dateFrom: dateFrom || '',
      dateTo: dateTo || '',
    });

    res.json({
      message: `${result.deleted} access log${result.deleted === 1 ? '' : 's'} deleted.`,
      deleted: result.deleted,
    });
  } catch (err) {
    console.error('Bulk delete logs error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const deleteAllLogs = async (req, res) => {
  try {
    const result = await adminService.deleteLogs({});

    res.json({
      message: `All access logs cleared (${result.deleted} removed).`,
      deleted: result.deleted,
    });
  } catch (err) {
    console.error('Clear logs error:', err);
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

const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteNotification(req.user.id, id);

    if (result.deleted === 0) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    res.json({ message: 'Notification deleted.', deleted: result.deleted });
  } catch (err) {
    console.error('Delete notification error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const deleteAllNotifications = async (req, res) => {
  try {
    const result = await adminService.deleteAllNotifications(req.user.id);

    res.json({
      message: `All notifications cleared (${result.deleted} removed).`,
      deleted: result.deleted,
    });
  } catch (err) {
    console.error('Delete all notifications error:', err);
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


const getImmersionPeriods = async (req, res) => {
  try {
    await adminService.refreshImmersionPeriodStatuses();
    const periods = await adminService.getImmersionPeriods();
    res.json({ periods });
  } catch (err) {
    console.error('Get immersion periods error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const createImmersionPeriod = async (req, res) => {
  try {
    const period = await adminService.createImmersionPeriod(req.body, req.user.id);
    await writeAuditLog(req, 'immersion_period_create', `Created immersion period: ${period.period_name}`);
    res.status(201).json({ period });
  } catch (err) {
    console.error('Create immersion period error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const updateImmersionPeriod = async (req, res) => {
  try {
    const period = await adminService.updateImmersionPeriod(Number(req.params.id), req.body);
    await writeAuditLog(req, 'immersion_period_update', `Updated immersion period: ${period.period_name}`);
    res.json({ period });
  } catch (err) {
    console.error('Update immersion period error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const deleteImmersionPeriod = async (req, res) => {
  try {
    await adminService.deleteImmersionPeriod(Number(req.params.id));
    await writeAuditLog(req, 'immersion_period_delete', `Deleted immersion period ID: ${req.params.id}`);
    res.json({ message: 'Immersion period deleted.' });
  } catch (err) {
    console.error('Delete immersion period error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getImmersionAccess = async (req, res) => {
  try {
    const access = await adminService.getImmersionAccess();
    res.json({ access });
  } catch (err) {
    console.error('Get immersion access error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const previewPeriodArchive = async (req, res) => {
  try {
    const periodId = Number(req.params.periodId);
    if (!periodId) return res.status(400).json({ error: 'Invalid period id.' });
    const preview = await periodArchiveService.previewPeriodArchive(periodId);
    if (!preview) return res.status(404).json({ error: 'Immersion period not found.' });
    res.json({ preview });
  } catch (err) {
    console.error('Preview archive error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const archivePeriod = async (req, res) => {
  try {
    const periodId = Number(req.params.periodId);
    if (!periodId) return res.status(400).json({ error: 'Invalid period id.' });
    const result = await periodArchiveService.archivePeriod(periodId, req.user?.id);
    await writeAuditLog(req, 'immersion_period_archive', `Archived immersion period: ${result.period.period_name}`);
    res.json({ message: 'Period archived successfully.', archiveId: result.archiveId });
  } catch (err) {
    console.error('Archive period error:', err);
    if (err.message === 'Immersion period not found.') {
      return res.status(404).json({ error: err.message });
    }
    if (err.message === 'This period has already been archived.') {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error.' });
  }
};

const listArchivePeriods = async (req, res) => {
  try {
    const periods = await periodArchiveService.listArchivePeriods();
    res.json({ periods });
  } catch (err) {
    console.error('List archive periods error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getArchivePeriod = async (req, res) => {
  try {
    const archiveId = Number(req.params.archiveId);
    if (!archiveId) return res.status(400).json({ error: 'Invalid archive id.' });
    const data = await periodArchiveService.getArchivePeriod(archiveId);
    if (!data) return res.status(404).json({ error: 'Archived period not found.' });
    res.json({ archive: data });
  } catch (err) {
    console.error('Get archive period error:', err);
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
  resendApprovalLink,
  resetUserPassword,
  updatePassword,
  uploadProfilePicture,
  listPendingCoordinators,
  approveCoordinator,
  rejectCoordinator,
  getSettings,
  updateSettings,
  setMaintenanceMode,
  getLogs,
  deleteLog,
  deleteLogs,
  deleteAllLogs,
  getNotifications,
  markNotificationsRead,
  deleteNotification,
  deleteAllNotifications,
  getReport,
  writeAuditLog,
  ensureAdminTables,
  uploadLogo,
  sendCsv,
  sendExcel,
  sendPdf,
  getImmersionPeriods,
  createImmersionPeriod,
  updateImmersionPeriod,
  deleteImmersionPeriod,
  getImmersionAccess,
  previewPeriodArchive,
  archivePeriod,
  listArchivePeriods,
  getArchivePeriod,
};


