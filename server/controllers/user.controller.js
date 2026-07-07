const pool = require('../db');
const nodemailer = require('nodemailer');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateToken');
const {
  getLoginAttempts,
  incrementLoginAttempts,
  resetLoginAttempts,
  isAccountLocked,
  LOCK_TIME_MINUTES,
} = require('../utils/loginAttempts');

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
      lastName,
      email,
      password,
      confirmPassword,
      phone,
    } = req.body;

    if (!studentId || !firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
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
      [trimmedEmail, hashedPassword, phone ? String(phone).trim() : null]
    );

    const userId = userResult.rows[0].id;

    // Insert into students table
    await client.query(
      `INSERT INTO students (user_id, student_number, first_name, last_name)
       VALUES ($1, $2, $3, $4)`,
      [userId, trimmedStudentId, firstName.trim(), lastName.trim()]
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



const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const trimmedEmail = String(email).trim();

    // Check lockout before even hitting the DB / comparing password
    const locked = await isAccountLocked(trimmedEmail);
    if (locked) {
      return res.status(423).json({
        error: `Account temporarily locked due to too many failed attempts. Try again in ${LOCK_TIME_MINUTES} minute(s).`,
      });
    }

    const result = await pool.query(
      `SELECT id, email, password, role, status
       FROM users WHERE email = $1`,
      [trimmedEmail]
    );

    if (result.rows.length === 0) {
      await incrementLoginAttempts(trimmedEmail);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];

    let profile = {};
    if (user.role === 'student') {
      const studentResult = await pool.query(
        `SELECT first_name, last_name FROM students WHERE user_id = $1`,
        [user.id]
      );
      profile = studentResult.rows[0] || {};
    } else if (user.role === 'teacher') {
      const teacherResult = await pool.query(
        `SELECT first_name, last_name FROM teachers WHERE user_id = $1`,
        [user.id]
      );
      profile = teacherResult.rows[0] || {};
    } else if (user.role === 'admin') {
      const adminResult = await pool.query(
        `SELECT first_name, last_name FROM admins WHERE user_id = $1`,
        [user.id]
      );
      profile = adminResult.rows[0] || {};
    } else if (user.role === 'supervisor') {
      const supervisorResult = await pool.query(
        `SELECT first_name, last_name FROM supervisors WHERE user_id = $1`,
        [user.id]
      );
      profile = supervisorResult.rows[0] || {};
    } else if (user.role === 'coordinator') {
      const coordinatorResult = await pool.query(
        `SELECT first_name, last_name FROM coordinators WHERE user_id = $1`,
        [user.id]
      );
      profile = coordinatorResult.rows[0] || {};
    }

    user.first_name = profile.first_name || null;
    user.last_name = profile.last_name || null;

    const match = await comparePassword(password, user.password);
    if (!match) {
      const attempts = await incrementLoginAttempts(trimmedEmail);
      return res.status(401).json({
        error: 'Invalid email or password.',
        attemptsRemaining: attempts !== undefined ? Math.max(0, 5 - attempts) : undefined,
      });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Your account is still pending approval.' });
    }
    if (user.status === 'disapproved') {
      return res.status(403).json({ error: 'Your account was not approved. Contact your coordinator or admin.' });
    }

    // Successful login — clear any failed attempt counter
    await resetLoginAttempts(trimmedEmail);

    const payload = { id: user.id, role: user.role, email: user.email };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);


    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    delete user.password;

    res.json({ message: 'Login successful.', accessToken, user });
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
                contact_number, email, home_address, grade_level, section, track_strand, school
         FROM students WHERE user_id = $1`,
        [req.user.id]
      );
      roleData = studentResult.rows[0] || {};
    } else if (user.role === 'teacher') {
      const teacherResult = await pool.query(
        `SELECT first_name, last_name, employee_id, department, designation, school
         FROM teachers WHERE user_id = $1`,
        [req.user.id]
      );
      roleData = teacherResult.rows[0] || {};
    } else if (user.role === 'admin') {
      const adminResult = await pool.query(
        `SELECT first_name, last_name, employee_id, department
         FROM admins WHERE user_id = $1`,
        [req.user.id]
      );
      roleData = adminResult.rows[0] || {};
    } else if (user.role === 'supervisor') {
      const supervisorResult = await pool.query(
        `SELECT first_name, last_name, employee_id, company_name, designation, department, company_address
         FROM supervisors WHERE user_id = $1`,
        [req.user.id]
      );
      roleData = supervisorResult.rows[0] || {};
    } else if (user.role === 'coordinator') {
      const coordinatorResult = await pool.query(
        `SELECT first_name, last_name, employee_id, department, designation, school
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

const setPassword = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    
    const result = await pool.query(
      `UPDATE users
       SET password = $1, status = 'approved', updated_at = CURRENT_TIMESTAMP
       WHERE email = $2 AND status IN ('pending', 'approved')
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

module.exports = {
  registerStudent,
  login,
  getMe,
  setPassword,
};

exports.registerStudent = registerStudent;
exports.login = login;
exports.getMe = getMe;
exports.setPassword = setPassword;