const pool = require('../db');
const { generateTemporaryPassword } = require('../utils/generatePassword');
const { hashPassword } = require('../utils/hashPassword');

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

async function getDashboardStats() {
  const q = `
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'student')        AS total_students,
      (SELECT COUNT(*) FROM users WHERE role = 'teacher')        AS total_teachers,
      (SELECT COUNT(*) FROM users WHERE role = 'supervisor')     AS total_supervisors,
      (SELECT COUNT(*) FROM users WHERE role = 'coordinator')    AS total_coordinators,
      (SELECT COUNT(*) FROM users WHERE status = 'approved')     AS total_active_users,
      (SELECT COUNT(*) FROM users WHERE status = 'pending')      AS total_pending_accounts,
      (SELECT COUNT(*) FROM users WHERE status = 'approved')     AS total_approved_accounts,
      (SELECT COUNT(*) FROM student_attendance)                  AS total_attendance_records,
      (SELECT COUNT(*) FROM student_requirement_submissions)     AS total_requirements_submitted
    FROM users
    LIMIT 1`;
  const result = await pool.query(q);
  const row = result.rows[0] || {};
  return {
    totalStudents: Number(row.total_students) || 0,
    totalTeachers: Number(row.total_teachers) || 0,
    totalSupervisors: Number(row.total_supervisors) || 0,
    totalCoordinators: Number(row.total_coordinators) || 0,
    totalActiveUsers: Number(row.total_active_users) || 0,
    totalPendingAccounts: Number(row.total_pending_accounts) || 0,
    totalApprovedAccounts: Number(row.total_approved_accounts) || 0,
    totalAttendanceRecords: Number(row.total_attendance_records) || 0,
    totalRequirementsSubmitted: Number(row.total_requirements_submitted) || 0,
  };
}

const USER_SELECT = `
  SELECT u.id, u.email, u.role, u.status, u.phone, u.created_at, u.updated_at,
         COALESCE(s.first_name, t.first_name, a.first_name, sup.first_name, c.first_name, '') AS first_name,
         COALESCE(s.last_name, t.last_name, a.last_name, sup.last_name, c.last_name, '')     AS last_name,
         COALESCE(s.student_number, t.employee_id, a.employee_id, sup.employee_id, c.employee_id, '') AS identifier
  FROM users u
  LEFT JOIN students s        ON u.id = s.user_id       AND u.role = 'student'
  LEFT JOIN teachers t        ON u.id = t.user_id       AND u.role = 'teacher'
  LEFT JOIN admins a          ON u.id = a.user_id       AND u.role = 'admin'
  LEFT JOIN supervisors sup   ON u.id = sup.user_id     AND u.role = 'supervisor'
  LEFT JOIN coordinators c    ON u.id = c.user_id       AND u.role = 'coordinator'
`;

async function getUsers({ search, role, status, page = 1, limit = 20 }) {
  const filters = [];
  const values = [];
  let i = 1;

  if (role) {
    filters.push(`u.role = $${i}`);
    values.push(role);
    i += 1;
  }
  if (status) {
    filters.push(`u.status = $${i}`);
    values.push(status);
    i += 1;
  }
  if (search) {
    const like = `%${search}%`;
    filters.push(
      `(u.email ILIKE $${i} OR s.first_name ILIKE $${i} OR s.last_name ILIKE $${i} OR t.first_name ILIKE $${i} OR t.last_name ILIKE $${i} OR a.first_name ILIKE $${i} OR a.last_name ILIKE $${i} OR sup.first_name ILIKE $${i} OR sup.last_name ILIKE $${i} OR c.first_name ILIKE $${i} OR c.last_name ILIKE $${i} OR s.student_number ILIKE $${i} OR t.employee_id ILIKE $${i} OR a.employee_id ILIKE $${i} OR sup.employee_id ILIKE $${i} OR c.employee_id ILIKE $${i})`
    );
    values.push(like);
    i += 1;
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const dataQuery = `${USER_SELECT} ${whereClause} ORDER BY u.created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
  const countQuery = `SELECT COUNT(*)::int AS total FROM users u ${whereClause}`;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [...values, limit, offset]),
    pool.query(countQuery, values),
  ]);

  return {
    users: dataResult.rows,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(countResult.rows[0]?.total) || 0,
    },
  };
}

async function getUserById(id) {
  const result = await pool.query(`${USER_SELECT} WHERE u.id = $1`, [id]);
  if (result.rows.length === 0) return null;
  const user = result.rows[0];

  const roleTable = {
    student: 'students',
    teacher: 'teachers',
    admin: 'admins',
    supervisor: 'supervisors',
    coordinator: 'coordinators',
  }[user.role];
  if (roleTable) {
    const cols = await pool.query(
      `SELECT * FROM information_schema.columns WHERE table_name = $1`,
      [roleTable]
    );
    const columnList = cols.rows.map((c) => c.column_name).filter((c) => c !== 'user_id');
    const roleResult = await pool.query(
      `SELECT ${columnList.join(', ')} FROM ${roleTable} WHERE user_id = $1`,
      [id]
    );
    if (roleResult.rows[0]) {
      return { ...user, profile: roleResult.rows[0] };
    }
  }
  return { ...user, profile: {} };
}

async function updateUser(id, payload) {
  const fields = [];
  const values = [];
  let i = 1;
  const allowed = ['email', 'phone', 'status'];
  for (const key of allowed) {
    if (payload[key] !== undefined) {
      fields.push(`${key} = $${i}`);
      values.push(payload[key]);
      i += 1;
    }
  }
  if (fields.length === 0) return getUserById(id);
  values.push(id);
  await pool.query(
    `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${i} RETURNING id`,
    values
  );
  return getUserById(id);
}

async function resetUserPassword(id, providedPassword) {
  const tempPassword = providedPassword || generateTemporaryPassword();
  const hashed = await hashPassword(tempPassword);
  await pool.query(
    `UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id`,
    [hashed, id]
  );
  return { tempPassword };
}

const ROLE_LABELS = {
  teacher: 'Teacher',
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
  student: 'Student',
  admin: 'Admin',
};

async function getPendingCoordinators() {
  const result = await pool.query(
    `SELECT u.id, u.email, u.role, u.status, u.created_at,
            c.first_name, c.last_name, c.employee_id, c.department, c.designation
     FROM users u
     JOIN coordinators c ON u.id = c.user_id
     WHERE u.status = 'pending'
     ORDER BY u.created_at DESC`
  );
  return result.rows;
}

async function updateAdminProfile(userId, { firstName, lastName, email, phone, department, photoUrl }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const fields = [];
    const values = [];
    let i = 1;
    const allowed = ['first_name', 'last_name', 'email', 'phone', 'department', 'photo_url'];
    const updates = {
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      department,
      photo_url: photoUrl,
    };

    for (const key of allowed) {
      if (updates[key] !== undefined && updates[key] !== null && updates[key] !== '') {
        fields.push(`${key} = $${i}`);
        values.push(updates[key]);
        i += 1;
      }
    }

    if (fields.length > 0) {
      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      await client.query(
        `UPDATE admins SET ${fields.join(', ')} WHERE user_id = $${i}`,
        [...values, userId]
      );
    }

    await client.query('COMMIT');

    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.status, u.phone, u.created_at, a.first_name, a.last_name, a.employee_id, a.department, a.photo_url
       FROM users u JOIN admins a ON u.id = a.user_id
       WHERE u.id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateAdminPassword(userId, currentPassword, newPassword) {
  const userResult = await pool.query(
    `SELECT u.password FROM users u WHERE u.id = $1 AND u.role = 'admin'`,
    [userId]
  );

  if (userResult.rows.length === 0) return null;

  const { comparePassword } = require('../utils/hashPassword');
  const match = await comparePassword(currentPassword, userResult.rows[0].password);
  if (!match) {
    throw new Error('Current password is incorrect');
  }

  const { hashPassword } = require('../utils/hashPassword');
  const newHash = await hashPassword(newPassword);
  await pool.query(
    `UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [newHash, userId]
  );
  return true;
}

async function getPendingStaff() {
  const result = await pool.query(
    `SELECT u.id, u.email, u.role, u.status, u.created_at,
           COALESCE(s.first_name, t.first_name, sup.first_name, c.first_name, '') AS first_name,
           COALESCE(s.last_name, t.last_name, sup.last_name, c.last_name, '')      AS last_name,
           COALESCE(s.student_number, t.employee_id, sup.employee_id, c.employee_id, '') AS identifier,
           COALESCE(c.department, t.department, sup.department, '') AS department
    FROM users u
    LEFT JOIN students s        ON u.id = s.user_id       AND u.role = 'student'
    LEFT JOIN teachers t        ON u.id = t.user_id       AND u.role = 'teacher'
    LEFT JOIN supervisors sup   ON u.id = sup.user_id     AND u.role = 'supervisor'
    LEFT JOIN coordinators c    ON u.id = c.user_id       AND u.role = 'coordinator'
    WHERE u.status = 'pending' AND u.role IN ('teacher', 'supervisor', 'coordinator')
    ORDER BY u.created_at DESC`
  );
  return result.rows;
}

async function approveCoordinator(id) {
  const result = await pool.query(
    `UPDATE users
     SET status = 'approved', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'pending' AND role = 'coordinator'
     RETURNING id, email, role`,
    [id]
  );
  if (result.rows.length === 0) return null;

  const user = result.rows[0];
  const tempPassword = generateTemporaryPassword();
  await pool.query(
    `UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [await hashPassword(tempPassword), id]
  );

  const coordResult = await pool.query(
    `SELECT first_name, last_name FROM coordinators WHERE user_id = $1`,
    [id]
  );
  const profile = coordResult.rows[0] || {};
  return { user, profile, tempPassword };
}

async function rejectCoordinator(id) {
  const result = await pool.query(
    `UPDATE users
     SET status = 'disapproved', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'pending' AND role = 'coordinator'
     RETURNING id, email, role`,
    [id]
  );
  if (result.rows.length === 0) return null;

  const user = result.rows[0];
  const coordResult = await pool.query(
    `SELECT first_name, last_name FROM coordinators WHERE user_id = $1`,
    [id]
  );
  const profile = coordResult.rows[0] || {};
  return { user, profile };
}

async function getSettings() {
  const result = await pool.query(
    `SELECT id, system_name, logo_url, school_name, school_address,
            academic_year, semester, attendance_time_in, attendance_time_out, announcements, updated_by, updated_at
     FROM system_settings WHERE id = 1`
  );
  return result.rows[0] || null;
}

async function updateSettings(payload, updatedBy) {
  const fields = [];
  const values = [];
  let i = 1;
  const allowed = [
    'system_name', 'logo_url', 'school_name', 'school_address',
    'academic_year', 'semester', 'attendance_time_in', 'attendance_time_out', 'announcements',
  ];
  for (const key of allowed) {
    if (payload[key] !== undefined) {
      fields.push(`${key} = $${i}`);
      values.push(payload[key]);
      i += 1;
    }
  }
  values.push(updatedBy, 1);
  await pool.query(
    `UPDATE system_settings
     SET ${fields.join(', ')}, updated_by = $${i}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${i + 1}`,
    values
  );
  return getSettings();
}

async function getLogs({
  page = 1,
  limit = 10,
  action,
  role,
  status,
  module,
  search,
  dateFrom,
  dateTo,
}) {
  const filters = [];
  const values = [];
  let i = 1;

  if (action) {
    filters.push(`al.action ILIKE $${i}`);
    values.push(`%${action}%`);
    i += 1;
  }
  if (role) {
    filters.push(`u.role = $${i}`);
    values.push(role);
    i += 1;
  }
  if (status) {
    filters.push(`al.status = $${i}`);
    values.push(status);
    i += 1;
  }
  if (module) {
    filters.push(`al.module ILIKE $${i}`);
    values.push(`%${module}%`);
    i += 1;
  }
  if (search) {
    const like = `%${search}%`;
    filters.push(
      `(COALESCE(s.first_name, '') ILIKE $${i} OR COALESCE(t.first_name, '') ILIKE $${i} OR COALESCE(a.first_name, '') ILIKE $${i} OR COALESCE(sup.first_name, '') ILIKE $${i} OR COALESCE(c.first_name, '') ILIKE $${i} OR COALESCE(s.last_name, '') ILIKE $${i} OR COALESCE(t.last_name, '') ILIKE $${i} OR COALESCE(a.last_name, '') ILIKE $${i} OR COALESCE(sup.last_name, '') ILIKE $${i} OR COALESCE(c.last_name, '') ILIKE $${i} OR u.email ILIKE $${i} OR al.action ILIKE $${i} OR al.details ILIKE $${i})`
    );
    values.push(like);
    i += 1;
  }
  if (dateFrom) {
    filters.push(`al.created_at >= $${i}`);
    values.push(dateFrom);
    i += 1;
  }
  if (dateTo) {
    filters.push(`al.created_at <= $${i}`);
    values.push(`${dateTo} 23:59:59`);
    i += 1;
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const dataQuery = `
    SELECT al.id, al.user_id, al.action, al.details, al.module, al.status, al.device, al.ip_address, al.created_at,
           COALESCE(s.first_name, t.first_name, a.first_name, sup.first_name, c.first_name, '') AS first_name,
           COALESCE(s.last_name, t.last_name, a.last_name, sup.last_name, c.last_name, '') AS last_name,
           u.email,
           u.role
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    LEFT JOIN students s ON u.id = s.user_id AND u.role = 'student'
    LEFT JOIN teachers t ON u.id = t.user_id AND u.role = 'teacher'
    LEFT JOIN admins a ON u.id = a.user_id AND u.role = 'admin'
    LEFT JOIN supervisors sup ON u.id = sup.user_id AND u.role = 'supervisor'
    LEFT JOIN coordinators c ON u.id = c.user_id AND u.role = 'coordinator'
    ${whereClause}
    ORDER BY al.created_at DESC
    LIMIT $${i} OFFSET $${i + 1}
  `;

  const countQuery = `SELECT COUNT(*)::int AS total FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id ${whereClause}`;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [...values, limit, offset]),
    pool.query(countQuery, values),
  ]);

  return {
    logs: dataResult.rows,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(countResult.rows[0]?.total) || 0,
    },
  };
}

async function getLogsForExport({ action, role, status, module, search, dateFrom, dateTo }) {
  const { logs } = await getLogs({ page: 1, limit: 10000, action, role, status, module, search, dateFrom, dateTo });
  return logs;
}

async function getNotifications(userId) {
  const result = await pool.query(
    `SELECT id, title, message, type, is_read, action_url, related_user_id, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId]
  );
  return result.rows;
}

async function createNotification({
  userId, title, message, type = 'info', actionUrl = '', relatedUserId = null,
}) {
  const result = await pool.query(
    `INSERT INTO notifications (user_id, title, message, type, action_url, related_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, title, message, type, is_read, action_url, related_user_id, created_at`,
    [userId, title, message, type, actionUrl, relatedUserId]
  );
  return result.rows[0];
}

async function markNotificationsRead(userId) {
  await pool.query(
    `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return { success: true };
}

async function ensureCoordinatorRegistrationNotifications(adminId) {
  const pending = await getPendingCoordinators();
  const existing = await pool.query(
    `SELECT related_user_id FROM notifications
     WHERE user_id = $1 AND type = 'coordinator_registration' AND is_read = false`,
    [adminId]
  );
  const alreadyNotified = new Set(
    existing.rows.map((r) => r.related_user_id).filter((v) => v !== null)
  );

  for (const coord of pending) {
    if (!alreadyNotified.has(coord.id)) {
      const fullName = `${coord.first_name || ''} ${coord.last_name || ''}`.trim() || coord.email;
      await createNotification({
        userId: adminId,
        title: 'New Coordinator Registration',
        message: `A new Coordinator ${fullName} is awaiting your approval.`,
        type: 'coordinator_registration',
        actionUrl: '/dashboard/admin/coordinators',
        relatedUserId: coord.id,
      });
    }
  }

  const announcements = await pool.query(
    `SELECT announcements FROM system_settings WHERE id = 1 AND announcements IS NOT NULL`
  );
  if (announcements.rows[0]?.announcements) {
    const existingAnn = await pool.query(
      `SELECT id FROM notifications WHERE user_id = $1 AND type = 'announcement' AND is_read = false LIMIT 1`,
      [adminId]
    );
    if (existingAnn.rows.length === 0) {
      await createNotification({
        userId: adminId,
        title: 'System Announcement',
        message: announcements.rows[0].announcements,
        type: 'announcement',
        actionUrl: '/dashboard/admin/settings',
      });
    }
  }
}

async function getUnreadNotificationCount(userId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return Number(result.rows[0]?.total) || 0;
}

async function getReport(type) {
  let query = '';
  switch (type) {
    case 'attendance':
      query = `
        SELECT sa.id, s.first_name, s.last_name, tb.batch_label,
               sa.date, sa.status, sa.check_in_time, sa.check_out_time
        FROM student_attendance sa
        JOIN students s ON sa.student_id = s.id
        JOIN teacher_batches tb ON sa.teacher_batch_id = tb.id
        ORDER BY sa.date DESC, sa.id DESC`;
      break;
    case 'students':
      query = `
        SELECT u.id, u.email, u.status, u.created_at,
               s.first_name, s.last_name, s.student_number, s.grade_level, s.section, s.track_strand,
               s.school, s.preferred_company
        FROM users u
        JOIN students s ON u.id = s.user_id
        ORDER BY u.created_at DESC`;
      break;
    case 'requirements':
      query = `
        SELECT srs.id, srs.status AS submission_status, srs.progress,
               srs.submitted_at, s.first_name, s.last_name, s.student_number,
               (SELECT COUNT(*) FROM student_documents sd WHERE sd.submission_id = srs.id) AS documents_count
        FROM student_requirement_submissions srs
        JOIN students s ON srs.student_id = s.id
        ORDER BY srs.created_at DESC`;
      break;
    case 'evaluations':
      query = `
        SELECT e.id, e.evaluation_type, e.rating, e.comments, e.created_at,
               s.first_name, s.last_name, s.student_number,
               u_eval.email AS evaluator_email, u_eval.role AS evaluator_role
        FROM evaluations e
        JOIN students s ON e.student_id = s.id
        LEFT JOIN users u_eval ON e.evaluator_id = u_eval.id
        ORDER BY e.created_at DESC`;
      break;
    case 'coordinators':
      query = `
        SELECT u.id, u.email, u.status, u.created_at,
               c.first_name, c.last_name, c.employee_id, c.department, c.designation
        FROM users u
        JOIN coordinators c ON u.id = c.user_id
        ORDER BY u.created_at DESC`;
      break;
    case 'users':
      query = `SELECT u.id, u.email, u.role, u.status, u.created_at,
                      COALESCE(s.first_name, t.first_name, a.first_name, sup.first_name, c.first_name, '') AS first_name,
                      COALESCE(s.last_name, t.last_name, a.last_name, sup.last_name, c.last_name, '') AS last_name
               FROM users u
               LEFT JOIN students s ON u.id = s.user_id AND u.role = 'student'
               LEFT JOIN teachers t ON u.id = t.user_id AND u.role = 'teacher'
               LEFT JOIN admins a ON u.id = a.user_id AND u.role = 'admin'
               LEFT JOIN supervisors sup ON u.id = sup.user_id AND u.role = 'supervisor'
               LEFT JOIN coordinators c ON u.id = c.user_id AND u.role = 'coordinator'
               ORDER BY u.created_at DESC`;
      break;
    default:
      throw new Error('Unknown report type');
  }
  const result = await pool.query(query);
  return result.rows;
}

module.exports = {
  ensureAdminTables,
  getDashboardStats,
  getUsers,
  getUserById,
  updateUser,
  resetUserPassword,
  updateAdminProfile,
  updateAdminPassword,
  getPendingCoordinators,
  getPendingStaff,
  approveCoordinator,
  rejectCoordinator,
  getSettings,
  updateSettings,
  getLogs,
  getLogsForExport,
  getNotifications,
  createNotification,
  markNotificationsRead,
  ensureCoordinatorRegistrationNotifications,
  getUnreadNotificationCount,
  getReport,
  ROLE_LABELS,
};
