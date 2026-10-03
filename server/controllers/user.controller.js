const pool = require('../db');
const nodemailer = require('nodemailer');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const { validatePassword, validateConfirmation } = require('../utils/passwordPolicy');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateToken');
const {
  getLoginAttempts,
  incrementLoginAttempts,
  resetLoginAttempts,
  isAccountLocked,
  LOCK_TIME_MINUTES,
} = require('../utils/loginAttempts');
const { readMaintenance } = require('../middleware/maintenance');
const { logSecurityEvent, countRecentEvents, SECURITY_EVENTS, SEVERITY } = require('../utils/securityLogger');
const tokenStore = require('../utils/tokenStore');

// Anti-enumeration (#8): every failed login returns the *same* generic message
// and status code regardless of whether the email exists, the password was
// wrong, the role did not match or the account is pending. Distinguishing these
// cases would let an attacker harvest valid accounts one request at a time.
const GENERIC_LOGIN_ERROR = 'Invalid email or password.';

// Thresholds for the behavioural detectors. Exceeding either one marks the
// attempt as brute-force / credential-stuffing in the telemetry feed so an
// operator can react (and act as an early warning before lockout kicks in).
const BRUTE_FORCE_WINDOW_MS = 10 * 60 * 1000;
const BRUTE_FORCE_THRESHOLD = 12;
const STUFFING_WINDOW_MS = 10 * 60 * 1000;
const STUFFING_IP_THRESHOLD = 8;

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate());
  }
  const str = String(dateStr);
  const [y, m, d] = str.substring(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

async function checkImmersionPeriodAccess(role) {
  try {
    const settingsResult = await pool.query(
      `SELECT immersion_start_date, immersion_end_date,
              access_student, access_teacher, access_coordinator, access_supervisor
       FROM system_settings WHERE id = 1`
    );
    const settings = settingsResult.rows[0] || {};

    const periodsResult = await pool.query(
      `SELECT id, period_name, start_date, end_date, is_active, status
       FROM immersion_periods
       WHERE is_active = true
       ORDER BY start_date DESC`
    );
    const activePeriod = periodsResult.rows.find((p) => {
      if (!p.start_date || !p.end_date) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = parseLocalDate(p.start_date);
      const end = parseLocalDate(p.end_date);
      if (!start || !end) return false;
      return today >= start && today <= end;
    }) || periodsResult.rows[0] || null;

    const roleAccess = {
      student: settings.access_student,
      teacher: settings.access_teacher,
      coordinator: settings.access_coordinator,
      supervisor: settings.access_supervisor,
    };

    if (activePeriod) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = parseLocalDate(activePeriod.start_date);
      const end = parseLocalDate(activePeriod.end_date);
      if (start && end) {
        if (today >= start && today <= end && roleAccess[role]) {
          return { blocked: false };
        }
        if (today < start) {
          return {
            blocked: true,
            phase: 'upcoming',
            message: `Work Immersion has not started yet. Your access will be available on ${start.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`,
            startDate: activePeriod.start_date,
            endDate: activePeriod.end_date,
          };
        }
        if (today > end) {
          return {
            blocked: true,
            phase: 'completed',
            message: 'Work Immersion has been completed. Login is no longer allowed for this period.',
            startDate: activePeriod.start_date,
            endDate: activePeriod.end_date,
          };
        }
      }
    }

    if (!settings.immersion_start_date || !settings.immersion_end_date) {
      return { blocked: false };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = parseLocalDate(settings.immersion_start_date);
    const end = parseLocalDate(settings.immersion_end_date);

    if (!start || !end) return { blocked: false };

    let phase = 'ongoing';
    if (today < start) phase = 'upcoming';
    else if (today > end) phase = 'completed';

    if (phase === 'ongoing' && roleAccess[role]) {
      return { blocked: false };
    }

    let message = 'Your access to immersion features is currently restricted.';
    if (phase === 'upcoming') {
      message = `Work Immersion has not started yet. Your access will be available on ${start.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`;
    } else if (phase === 'completed') {
      message = 'Work Immersion has been completed. Login is no longer allowed for this period.';
    } else if (!roleAccess[role]) {
      message = `Your role (${role}) does not have access to immersion features during this period.`;
    }

    return {
      blocked: true,
      message,
      phase,
      startDate: settings.immersion_start_date,
      endDate: settings.immersion_end_date,
    };
  } catch (err) {
    console.error('checkImmersionPeriodAccess error:', err);
    return { blocked: false };
  }
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function getClientUrl() {
  return process.env.CLIENT_URL || 'http://localhost:5173';
}

async function sendRegistrationReceivedEmail(user) {
  try {
    await transporter.sendMail({
      from: `"Work Immersion System" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Your Work Immersion Student Registration',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2a5298;">Registration Received</h2>
          <p>Hello <strong>${user.first_name} ${user.last_name}</strong>,</p>
          <p>Thanks for registering for the Work Immersion Management System. Your account is <strong>pending approval</strong> from your coordinator.</p>
          <p><strong>Student ID:</strong> ${user.student_id}</p>
          <p><strong>Email:</strong> ${user.email}</p>
          <p style="color: #666; font-size: 12px;">You will receive another email once your account is approved.</p>
          <p style="color: #666; font-size: 12px;">Marinduque National High School - Work Immersion Office</p>
        </div>
      `,
    });
    console.log(`Registration email sent to ${user.email}`);
  } catch (emailErr) {
    // Registration should still succeed even if the email fails to send.
    console.error(`Failed to send registration email to ${user.email}:`, emailErr.message);
  }
}


const registerStudent = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      studentId,
      firstName,
      middleName,
      lastName,
      section,
      strand,
      school,
      gender,
      email,
      password,
      confirmPassword,
      phone,
    } = req.body;

    if (!studentId || !firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    if (confirmPassword === undefined || password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    const weak = validatePassword(password);
    if (weak) {
      return res.status(400).json({ error: weak });
    }

    const trimmedEmail = String(email).trim();
    const trimmedStudentId = String(studentId).trim();

    // Check if email already exists
    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [trimmedEmail]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    // Check if student_number already exists
    const existingStudent = await client.query(
      'SELECT id FROM students WHERE student_number = $1',
      [trimmedStudentId]
    );
    if (existingStudent.rows.length > 0) {
      return res.status(409).json({ error: 'Student ID already registered.' });
    }

    const hashedPassword = await hashPassword(password);

    await client.query('BEGIN');

    // Insert into users table
    const userResult = await client.query(
      `INSERT INTO users (email, password, role, phone, status)
       VALUES ($1, $2, 'student', $3, 'pending')
       RETURNING id, email, role, status`,
      [trimmedEmail, hashedPassword, String(phone || '').trim()]
    );

    const userId = userResult.rows[0].id;

    // Insert into students table
    await client.query(
      `INSERT INTO students
        (user_id, student_number, first_name, middle_name, last_name, grade_level,
         section, track_strand, school, contact_number, gender, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        userId,
        trimmedStudentId,
        firstName.trim(),
        String(middleName || '').trim(),
        lastName.trim(),
        '12',
        String(section || '').trim(),
        String(strand || '').trim(),
        String(school || '').trim(),
        String(phone || '').trim(),
        String(gender || '').trim(),
        trimmedEmail,
      ]
    );

    await client.query('COMMIT');

    const user = userResult.rows[0];
    user.first_name = firstName;
    user.last_name = lastName;
    
    await sendRegistrationReceivedEmail(user);

    res.status(201).json({
      message: 'Registration successful. Your account is pending approval.',
      user,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Register student error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  } finally {
    client.release();
  }
};



// Constant-ish-time guard used when an email does not exist, so a missing
// account is not measurably faster to reject than a wrong password. Without
// this, response timing is itself an enumeration oracle (#8).
async function dummyCompare() {
  try {
    await comparePassword('timing-equalizer', '$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZGm3rS0m2jV6Qq0K7Kq0K7Kq0K7Kq0K');
  } catch {
    // ignore: bcrypt.compare on a malformed hash still costs some time
  }
}

// Records a failed attempt and, if the failure count crosses the behavioural
// thresholds, emits a brute-force / credential-stuffing security event.
async function registerFailedLogin(req, email, reason) {
  const attempts = await incrementLoginAttempts(email);
  const ip = require('../utils/securityLogger').getClientIp(req);

  await logSecurityEvent({
    type: SECURITY_EVENTS.LOGIN_FAILED,
    severity: SEVERITY.WARNING,
    req,
    email,
    detail: reason,
    metadata: { attempts: attempts?.attempts ?? null },
  });

  // Same-email burst -> brute force (#2).
  const perEmail = await countRecentEvents({
    type: SECURITY_EVENTS.LOGIN_FAILED,
    email,
    windowMs: BRUTE_FORCE_WINDOW_MS,
  });
  if (perEmail >= BRUTE_FORCE_THRESHOLD) {
    await logSecurityEvent({
      type: SECURITY_EVENTS.BRUTE_FORCE_SUSPECTED,
      severity: SEVERITY.HIGH,
      req,
      email,
      detail: `${perEmail} failures in ${BRUTE_FORCE_WINDOW_MS / 60000} min for one account.`,
    });
  }

  // Many emails from one IP -> credential stuffing (#3).
  const perIp = await countRecentEvents({
    type: SECURITY_EVENTS.LOGIN_FAILED,
    ip,
    windowMs: STUFFING_WINDOW_MS,
  });
  if (perIp >= STUFFING_IP_THRESHOLD) {
    await logSecurityEvent({
      type: SECURITY_EVENTS.CREDENTIAL_STUFFING_SUSPECTED,
      severity: SEVERITY.HIGH,
      req,
      email,
      detail: `${perIp} failures from one IP in ${STUFFING_WINDOW_MS / 60000} min.`,
    });
  }

  return attempts;
}

const login = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const trimmedEmail = String(email).trim();

    // Check lockout before even hitting the DB / comparing password
    const locked = await isAccountLocked(trimmedEmail);
    if (locked) {
      await logSecurityEvent({
        type: SECURITY_EVENTS.LOGIN_LOCKED,
        severity: SEVERITY.WARNING,
        req,
        email: trimmedEmail,
        detail: 'Login attempted while account was locked.',
      });
      // Same generic wording as a normal failure: revealing "this account is
      // locked" would confirm the account exists (#8).
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }

    const result = await pool.query(
      `SELECT id, email, password, role, status
       FROM users WHERE email = $1`,
      [trimmedEmail]
    );

    if (result.rows.length === 0) {
      // Burn comparable time to a real bcrypt compare, then fail generically.
      await dummyCompare();
      await registerFailedLogin(req, trimmedEmail, 'unknown email');
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }

    const user = result.rows[0];

    // Validate role: if a role is requested, the user's account must match it.
    // Fail with the same generic message so the response cannot be used to
    // learn that the email exists under a different role (#8).
    if (role && user.role !== role) {
      await registerFailedLogin(req, trimmedEmail, 'role mismatch');
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }

    let profile = {};
    if (user.role === 'student') {
      const studentResult = await pool.query(
        `SELECT first_name, last_name, photo_url FROM students WHERE user_id = $1`,
        [user.id]
      );
      profile = studentResult.rows[0] || {};
    } else if (user.role === 'teacher') {
      const teacherResult = await pool.query(
        `SELECT first_name, last_name, photo_url FROM teachers WHERE user_id = $1`,
        [user.id]
      );
      profile = teacherResult.rows[0] || {};
    } else if (user.role === 'admin') {
      const adminResult = await pool.query(
        `SELECT first_name, last_name, photo_url FROM admins WHERE user_id = $1`,
        [user.id]
      );
      profile = adminResult.rows[0] || {};
    } else if (user.role === 'supervisor') {
      const supervisorResult = await pool.query(
        `SELECT first_name, last_name, photo_url FROM supervisors WHERE user_id = $1`,
        [user.id]
      );
      profile = supervisorResult.rows[0] || {};
    } else if (user.role === 'coordinator') {
      const coordinatorResult = await pool.query(
        `SELECT first_name, last_name, photo_url FROM coordinators WHERE user_id = $1`,
        [user.id]
      );
      profile = coordinatorResult.rows[0] || {};
    }

    user.first_name = profile.first_name || null;
    user.last_name = profile.last_name || null;
    user.photo_url = profile.photo_url || null;

    const match = await comparePassword(password, user.password);
    if (!match) {
      // Deliberately do NOT return `attemptsRemaining`: it leaks that the email
      // is real and lets an attacker budget their guesses (#2/#8).
      await registerFailedLogin(req, trimmedEmail, 'bad password');
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }

    // Account-state failures only surface *after* the password is proven
    // correct, so they cannot be used to probe which emails exist (#8).
    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Your account is still pending approval.' });
    }
    if (user.status === 'disapproved') {
      return res.status(403).json({ error: 'Your account was not approved. Contact your coordinator or admin.' });
    }

    // Block login outside the active immersion period (except for admins).
    if (user.role !== 'admin') {
      const maintenance = await readMaintenance();
      if (maintenance.enabled) {
        return res.status(503).json({
          error: maintenance.message,
          maintenance: true,
          startedAt: maintenance.startedAt,
          estimatedEnd: maintenance.estimatedEnd,
        });
      }

      const accessBlock = await checkImmersionPeriodAccess(user.role);
      if (accessBlock.blocked) {
        return res.status(403).json({
          error: accessBlock.message,
          phase: accessBlock.phase,
          startDate: accessBlock.startDate,
          endDate: accessBlock.endDate,
        });
      }
    }

    // Successful login — clear any failed attempt counter
    await resetLoginAttempts(trimmedEmail);

    const payload = { id: user.id, role: user.role, email: user.email };
    const accessToken = generateAccessToken(payload);
    // generateRefreshToken now returns { token, jti } so the rotation record can
    // be persisted and later validated/revoked (#7 session hijacking).
    const { token: refreshToken, jti: refreshJti } = generateRefreshToken(payload);

    try {
      await tokenStore.storeRefreshToken({ userId: user.id, token: refreshToken, jti: refreshJti, req });
    } catch (storeErr) {
      console.warn('Failed to persist refresh token:', storeErr.message);
    }

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: tokenStore.REFRESH_TTL_MS, // 7 days
    });

    await logSecurityEvent({
      type: SECURITY_EVENTS.LOGIN_SUCCESS,
      severity: SEVERITY.INFO,
      req,
      userId: user.id,
      email: user.email,
    });

    delete user.password;

    // The CSRF cookie is issued globally by middleware; echo it so the SPA can
    // begin sending the X-CSRF-Token header immediately after login.
    res.json({
      message: 'Login successful.',
      accessToken,
      csrfToken: req.cookies?.csrfToken || null,
      user,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
};


const getMe = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.status, u.phone
       FROM users u
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    
    const user = result.rows[0];
    
    // Fetch role-specific data
    let roleData = {};
    if (user.role === 'student') {
      const studentResult = await pool.query(
        `SELECT first_name, last_name, student_number, gender, birthdate, age, 
                contact_number, email, home_address, grade_level, section, track_strand, school, photo_url
         FROM students WHERE user_id = $1`,
        [req.user.id]
      );
      roleData = studentResult.rows[0] || {};
    } else if (user.role === 'teacher') {
      const teacherResult = await pool.query(
        `SELECT first_name, last_name, employee_id, department, designation, school, photo_url
         FROM teachers WHERE user_id = $1`,
        [req.user.id]
      );
      roleData = teacherResult.rows[0] || {};
    } else if (user.role === 'admin') {
      const adminResult = await pool.query(
        `SELECT first_name, last_name, employee_id, department, photo_url
         FROM admins WHERE user_id = $1`,
        [req.user.id]
      );
      roleData = adminResult.rows[0] || {};
    } else if (user.role === 'supervisor') {
      const supervisorResult = await pool.query(
        `SELECT first_name, last_name, employee_id, company_name, designation, department, company_address, photo_url
         FROM supervisors WHERE user_id = $1`,
        [req.user.id]
      );
      roleData = supervisorResult.rows[0] || {};
    } else if (user.role === 'coordinator') {
      const coordinatorResult = await pool.query(
        `SELECT first_name, last_name, employee_id, department, designation, school, photo_url
         FROM coordinators WHERE user_id = $1`,
        [req.user.id]
      );
      roleData = coordinatorResult.rows[0] || {};
    }
    
    res.json({ user: { ...user, ...roleData } });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// Account activation only. This route is deliberately unauthenticated (a new
// staff member cannot log in to activate), so it must never be able to touch an
// account that is already usable. Restricting it to status = 'pending' means
// knowing an email address alone can no longer overwrite the password of a
// live, approved account (previously status IN ('pending','approved') allowed
// exactly that). Changing the password of an active account goes through
// PATCH /api/users/profile/password or the emailed reset-token flow, both of
// which prove control of the account first.
const setPassword = async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const problem = validatePassword(password);
    if (problem) {
      return res.status(400).json({ error: problem });
    }

    const mismatch = validateConfirmation(password, confirmPassword);
    if (mismatch) {
      return res.status(400).json({ error: mismatch });
    }

    const result = await pool.query(
      `UPDATE users
       SET password = $1, status = 'approved', updated_at = CURRENT_TIMESTAMP
       WHERE email = $2 AND status = 'pending'
       RETURNING id, email, role`,
      [await hashPassword(password), email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found or cannot set password.' });
    }

    res.json({ message: 'Password set successfully. You can now log in.' });
  } catch (err) {
    console.error('Set password error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// Rotating refresh endpoint (#7). Exchanges a valid refresh cookie for a fresh
// access token and a *new* refresh token, revoking the old one. Replaying an
// already-revoked refresh token revokes the whole family and is logged as a
// critical event (see utils/tokenStore.validateRefreshToken).
const refreshAccessToken = async (req, res) => {
  try {
    const presented = req.cookies?.refreshToken;
    if (!presented) {
      return res.status(401).json({ error: 'No refresh token provided.' });
    }

    const { verifyRefreshToken } = require('../utils/generateToken');
    let decoded;
    try {
      decoded = verifyRefreshToken(presented);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    const check = await tokenStore.validateRefreshToken(presented, req);
    if (!check.valid) {
      res.clearCookie('refreshToken');
      return res.status(401).json({ error: 'Refresh token is no longer valid.' });
    }

    const userResult = await pool.query(
      'SELECT id, email, role, status FROM users WHERE id = $1',
      [check.row.user_id]
    );
    if (userResult.rows.length === 0) {
      res.clearCookie('refreshToken');
      return res.status(401).json({ error: 'Account no longer exists.' });
    }
    const user = userResult.rows[0];
    // Must match the login gate (lines 453/456), which rejects only these two
    // states. Requiring exactly 'approved' here broke refresh for accounts
    // stored as 'active' - notably admins - so their access token could never
    // be renewed.
    if (user.status === 'pending' || user.status === 'disapproved') {
      res.clearCookie('refreshToken');
      return res.status(403).json({ error: 'Account is not active.' });
    }

    const payload = { id: user.id, role: user.role, email: user.email };
    const accessToken = generateAccessToken(payload);
    const { token: newRefresh, jti: newJti } = generateRefreshToken(payload);

    // Rotate: revoke the presented token and persist the replacement.
    await tokenStore.rotateRefreshToken(presented, newJti);
    await tokenStore.storeRefreshToken({ userId: user.id, token: newRefresh, jti: newJti, req });

    res.cookie('refreshToken', newRefresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: tokenStore.REFRESH_TTL_MS,
    });

    return res.json({ accessToken, csrfToken: req.cookies?.csrfToken || null });
  } catch (err) {
    console.error('Refresh token error:', err);
    return res.status(500).json({ error: 'Server error during token refresh.' });
  }
};

// Logout (#7). Revokes the refresh token AND adds the current access token's
// jti to the deny-list so the still-valid access token cannot be replayed.
const logout = async (req, res) => {
  try {
    const refresh = req.cookies?.refreshToken;
    if (refresh) {
      await tokenStore.revokeRefreshToken(refresh);
    }
    if (req.user?.jti) {
      await tokenStore.revokeAccessToken({ jti: req.user.jti, userId: req.user.id, reason: 'logout' });
    }
    await logSecurityEvent({
      type: SECURITY_EVENTS.TOKEN_REVOKED,
      severity: SEVERITY.INFO,
      req,
      userId: req.user?.id || null,
      detail: 'User logged out.',
    });
  } catch (err) {
    console.warn('Logout cleanup error:', err.message);
  }

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  const { clearCsrfToken } = require('../middleware/csrfProtection');
  clearCsrfToken(res);
  return res.json({ message: 'Logged out successfully.' });
};

module.exports = {
  registerStudent,
  login,
  refreshAccessToken,
  logout,
  getMe,
  setPassword,
  checkImmersionPeriodAccess,
};

exports.registerStudent = registerStudent;
exports.login = login;
exports.refreshAccessToken = refreshAccessToken;
exports.logout = logout;
exports.getMe = getMe;
exports.setPassword = setPassword;
exports.checkImmersionPeriodAccess = checkImmersionPeriodAccess;