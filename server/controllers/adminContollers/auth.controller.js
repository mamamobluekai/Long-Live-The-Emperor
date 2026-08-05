const pool = require('../../db');
const { hashPassword, comparePassword } = require('../../utils/hashPassword');
const { generateAccessToken, generateRefreshToken } = require('../../utils/generateToken');
const {
  incrementLoginAttempts,
  resetLoginAttempts,
  isAccountLocked,
  LOCK_TIME_MINUTES,
} = require('../../utils/loginAttempts');
const { writeAuditLog } = require('./admin.controller');
const { getUnreadNotificationCount, ensureAdminTables, ensureCoordinatorRegistrationNotifications } = require('../../services/admin.service');

async function getClientUrl() {
  return process.env.CLIENT_URL || 'http://localhost:5173';
}

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const trimmedEmail = String(email).trim();

    const locked = await isAccountLocked(trimmedEmail);
    if (locked) {
      return res.status(423).json({
        error: `Account temporarily locked due to too many failed attempts. Try again in ${LOCK_TIME_MINUTES} minute(s).`,
      });
    }

    const result = await pool.query(
      `SELECT id, email, password, role, status FROM users WHERE email = $1`,
      [trimmedEmail]
    );

    if (result.rows.length === 0) {
      await incrementLoginAttempts(trimmedEmail);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];

    if (user.role !== 'admin') {
      await incrementLoginAttempts(trimmedEmail);
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const match = await comparePassword(password, user.password);
    if (!match) {
      const attempts = await incrementLoginAttempts(trimmedEmail);
      return res.status(401).json({
        error: 'Invalid email or password.',
        attemptsRemaining: attempts !== undefined ? Math.max(0, 5 - attempts.attempts) : undefined,
      });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Your account is still pending approval.' });
    }
    if (user.status === 'disapproved') {
      return res.status(403).json({
        error: 'Your account was not approved. Contact your administrator.',
      });
    }

    await resetLoginAttempts(trimmedEmail);

    const adminResult = await pool.query(
      `SELECT first_name, last_name, employee_id, department, photo_url FROM admins WHERE user_id = $1`,
      [user.id]
    );
    const profile = adminResult.rows[0] || {};

    const payload = { id: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const safeUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      first_name: profile.first_name || null,
      last_name: profile.last_name || null,
      employee_id: profile.employee_id || null,
      department: profile.department || null,
      photo_url: profile.photo_url || null,
    };

    req.user = { id: user.id, role: user.role, email: user.email };
    await writeAuditLog(req, 'login', `${safeUser.first_name || ''} ${safeUser.last_name || ''}`.trim());

    try {
      await ensureAdminTables();
      await ensureCoordinatorRegistrationNotifications(user.id);
    } catch (notifErr) {
      console.error('Notification sync error:', notifErr.message);
    }

    const unread = await getUnreadNotificationCount(user.id);
    res.json({ message: 'Login successful.', accessToken, user: safeUser, unreadNotifications: unread });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
};

const logout = async (req, res) => {
  try {
    await writeAuditLog(req, 'logout', '');
  } catch (e) {
    console.error('Logout audit log error:', e.message);
  }
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
    res.json({ message: 'Logged out successfully.' });
};

const updateProfile = async (req, res) => {
  const client = await pool.connect();
  try {
    const { first_name, last_name, email, phone, department } = req.body;
    await client.query('BEGIN');

    if (email !== undefined || phone !== undefined) {
      const userFields = [];
      const userValues = [];
      let i = 1;
      if (email !== undefined) { userFields.push(`email = $${i}`); userValues.push(email); i++; }
      if (phone !== undefined) { userFields.push(`phone = $${i}`); userValues.push(phone); i++; }
      userFields.push(`updated_at = CURRENT_TIMESTAMP`);
      userValues.push(req.user.id);
      await client.query(`UPDATE users SET ${userFields.join(', ')} WHERE id = $${i}`, userValues);
    }

    const adminFields = [];
    const adminValues = [];
    let j = 1;
    if (first_name !== undefined) { adminFields.push(`first_name = $${j}`); adminValues.push(first_name); j++; }
    if (last_name !== undefined) { adminFields.push(`last_name = $${j}`); adminValues.push(last_name); j++; }
    if (department !== undefined) { adminFields.push(`department = $${j}`); adminValues.push(department); j++; }
    if (adminFields.length > 0) {
      adminFields.push(`updated_at = CURRENT_TIMESTAMP`);
      adminValues.push(req.user.id);
      await client.query(`UPDATE admins SET ${adminFields.join(', ')} WHERE user_id = $${j}`, adminValues);
    }

    await client.query('COMMIT');
    await writeAuditLog(req, 'profile_update', 'Admin updated profile');

    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.status, u.phone, u.created_at, u.updated_at,
              a.first_name, a.last_name, a.employee_id, a.department, a.photo_url
       FROM users u JOIN admins a ON u.id = a.user_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin profile update error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const profile = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.status, u.phone, u.created_at, u.updated_at
       FROM users u WHERE u.id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = result.rows[0];
    const adminResult = await pool.query(
      `SELECT first_name, last_name, employee_id, department, photo_url FROM admins WHERE user_id = $1`,
      [req.user.id]
    );
    const profileData = adminResult.rows[0] || {};
    const unread = await getUnreadNotificationCount(user.id);
    res.json({ user: { ...user, ...profileData }, unreadNotifications: unread });
  } catch (err) {
    console.error('Admin profile error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { login, logout, profile, updateProfile };
