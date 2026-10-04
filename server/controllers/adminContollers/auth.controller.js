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
const { normalizeEmail } = require('../../utils/normalizeEmail');
const { getUnreadNotificationCount, ensureAdminTables, ensureCoordinatorRegistrationNotifications } = require('../../services/admin.service');
const { logSecurityEvent, SECURITY_EVENTS, SEVERITY } = require('../../utils/securityLogger');
const tokenStore = require('../../utils/tokenStore');
const { getRefreshCookieOptions } = require('../../utils/refreshCookie');

// Anti-enumeration (#8): the admin login returns the same generic message for a
// non-existent email, a non-admin email and a wrong password.
const GENERIC_LOGIN_ERROR = 'Invalid email or password.';

async function getClientUrl() {
  return process.env.CLIENT_URL || 'http://localhost:5173';
}

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Normalised so a signed-in admin reaches their account however they typed
    // the address; see utils/normalizeEmail.js.
    const trimmedEmail = normalizeEmail(email);

    const locked = await isAccountLocked(trimmedEmail);
    if (locked) {
      // Generic response so a locked account is indistinguishable from a bad
      // password (otherwise lockout itself confirms the email exists, #8).
      await logSecurityEvent({
        type: SECURITY_EVENTS.LOGIN_LOCKED,
        severity: SEVERITY.WARNING,
        req,
        email: trimmedEmail,
        detail: 'Admin login attempted while locked.',
      });
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }

    const result = await pool.query(
      `SELECT id, email, password, role, status FROM users WHERE email = $1`,
      [trimmedEmail]
    );

    if (result.rows.length === 0) {
      await incrementLoginAttempts(trimmedEmail);
      await logSecurityEvent({ type: SECURITY_EVENTS.LOGIN_FAILED, severity: SEVERITY.WARNING, req, email: trimmedEmail, detail: 'admin login: unknown email' });
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }

    const user = result.rows[0];

    // Non-admin email: fail with the same generic message so the endpoint cannot
    // be used to enumerate which emails are administrators (#8).
    if (user.role !== 'admin') {
      await incrementLoginAttempts(trimmedEmail);
      await logSecurityEvent({ type: SECURITY_EVENTS.LOGIN_FAILED, severity: SEVERITY.WARNING, req, email: trimmedEmail, detail: 'admin login: non-admin account' });
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }

    const match = await comparePassword(password, user.password);
    if (!match) {
      // No `attemptsRemaining` — it would leak that the account exists (#2/#8).
      await incrementLoginAttempts(trimmedEmail);
      await logSecurityEvent({ type: SECURITY_EVENTS.LOGIN_FAILED, severity: SEVERITY.WARNING, req, email: trimmedEmail, detail: 'admin login: bad password' });
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
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
    // generateRefreshToken returns { token, jti }; persist the rotation record
    // so this token can be validated and revoked later (#7 session hijacking).
    const { token: refreshToken, jti: refreshJti } = generateRefreshToken(payload);

    try {
      await tokenStore.storeRefreshToken({ userId: user.id, token: refreshToken, jti: refreshJti, req });
    } catch (storeErr) {
      console.warn('Failed to persist admin refresh token:', storeErr.message);
    }

    res.cookie('refreshToken', refreshToken, {
      ...getRefreshCookieOptions(),
      maxAge: tokenStore.REFRESH_TTL_MS,
    });

    await logSecurityEvent({
      type: SECURITY_EVENTS.LOGIN_SUCCESS,
      severity: SEVERITY.INFO,
      req,
      userId: user.id,
      email: user.email,
      detail: 'admin login',
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
    res.json({
      message: 'Login successful.',
      accessToken,
      csrfToken: req.cookies?.csrfToken || null,
      user: safeUser,
      unreadNotifications: unread,
    });
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

  // Revoke the refresh token and deny-list the current access token (#7).
  try {
    const refresh = req.cookies?.refreshToken;
    if (refresh) await tokenStore.revokeRefreshToken(refresh);
    if (req.user?.jti) {
      await tokenStore.revokeAccessToken({ jti: req.user.jti, userId: req.user.id, reason: 'admin_logout' });
    }
  } catch (e) {
    console.warn('Admin logout revoke error:', e.message);
  }

  res.clearCookie('refreshToken', getRefreshCookieOptions());
  const { clearCsrfToken } = require('../../middleware/csrfProtection');
  clearCsrfToken(res);
    res.json({ message: 'Logged out successfully.' });
};

const updateProfile = async (req, res) => {
  const client = await pool.connect();
  try {
    const { first_name, last_name, email, phone, department } = req.body;
    await client.query('BEGIN');

    let newEmail = null;
    if (email !== undefined && email !== null && String(email).trim() !== '') {
      newEmail = String(email).trim().toLowerCase();
      if (newEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      const taken = await client.query(
        'SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2',
        [newEmail, req.user.id]
      );
      if (taken.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'That email address is already in use.' });
      }
    }

    if (email !== undefined || phone !== undefined) {
      const userFields = [];
      const userValues = [];
      let i = 1;
      if (email !== undefined && email !== null && String(email).trim() !== '') { userFields.push(`email = $${i}`); userValues.push(newEmail); i++; }
      if (phone !== undefined) { userFields.push(`phone = $${i}`); userValues.push(phone); i++; }
      if (userFields.length > 0) {
        userFields.push(`updated_at = CURRENT_TIMESTAMP`);
        userValues.push(req.user.id);
        await client.query(`UPDATE users SET ${userFields.join(', ')} WHERE id = ${i}`, userValues);
      }
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
    await writeAuditLog(
      req,
      'profile_update',
      newEmail ? `Admin changed their email to ${newEmail}` : 'Admin updated profile'
    );

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
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback error:', rollbackErr);
    }
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'That email address is already in use.' });
    }
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
