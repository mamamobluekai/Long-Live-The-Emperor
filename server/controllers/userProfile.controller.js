const pool = require('../db');
const cloudinary = require('../db/cloudinary');
const streamifier = require('streamifier');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const { writeAuditLog } = require('./adminContollers/admin.controller');

function uploadBufferToCloudinary(buffer, resourceType, originalName) {
  return new Promise((resolve, reject) => {
    const options = {
      resource_type: resourceType,
      folder: 'user_uploads',
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

const ROLE_TABLES = {
  student: 'students',
  teacher: 'teachers',
  supervisor: 'supervisors',
  coordinator: 'coordinators',
  admin: 'admins',
};

const getMyProfile = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.status, u.phone, u.created_at, u.updated_at
       FROM users u
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = result.rows[0];
    const roleTable = ROLE_TABLES[user.role];
    if (!roleTable) {
      return res.status(400).json({ error: 'Invalid user role.' });
    }

    const profileResult = await pool.query(
      `SELECT * FROM ${roleTable} WHERE user_id = $1`,
      [req.user.id]
    );
    const profile = profileResult.rows[0] || {};

    res.json({ user: { ...user, ...profile } });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const updateMyProfile = async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body;
    await client.query('BEGIN');

    const userFields = [];
    const userValues = [];
    let ui = 1;

    if (body.email !== undefined && body.email !== null && body.email !== '') {
      userFields.push(`email = $${ui}`);
      userValues.push(body.email);
      ui++;
    }
    if (body.phone !== undefined) {
      userFields.push(`phone = $${ui}`);
      userValues.push(body.phone);
      ui++;
    }
    if (userFields.length > 0) {
      userFields.push(`updated_at = CURRENT_TIMESTAMP`);
      userValues.push(req.user.id);
      await client.query(`UPDATE users SET ${userFields.join(', ')} WHERE id = $${ui}`, userValues);
    }

    const roleTable = ROLE_TABLES[req.user.role];
    if (!roleTable) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid user role.' });
    }

    const roleFields = [];
    const roleValues = [];
    let ri = 1;

    const allowedRoleFields = [
      'first_name', 'last_name', 'student_number', 'employee_id',
      'department', 'designation', 'school', 'gender', 'birthdate',
      'age', 'contact_number', 'home_address', 'grade_level', 'section',
      'track_strand', 'preferred_industry', 'preferred_company',
      'career_goal', 'industry_reason', 'guardian_name',
      'guardian_relationship', 'guardian_contact', 'guardian_email',
      'guardian_address', 'emergency_contact', 'emergency_contact_number',
      'academic_notes', 'company_name', 'company_address',
    ];

    for (const field of allowedRoleFields) {
      if (body[field] !== undefined) {
        roleFields.push(`${field} = $${ri}`);
        roleValues.push(body[field] === '' ? null : body[field]);
        ri++;
      }
    }

    if (roleFields.length > 0) {
      roleFields.push(`updated_at = CURRENT_TIMESTAMP`);
      roleValues.push(req.user.id);
      await client.query(`UPDATE ${roleTable} SET ${roleFields.join(', ')} WHERE user_id = $${ri}`, roleValues);
    }

    await client.query('COMMIT');

    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.status, u.phone, u.created_at, u.updated_at,
              p.*
       FROM users u
       JOIN ${roleTable} p ON u.id = p.user_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await writeAuditLog(req, 'profile_update', `${req.user.role} updated their profile`);
    res.json({ user: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const changeMyPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const result = await pool.query(`SELECT password FROM users WHERE id = $1`, [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const match = await comparePassword(currentPassword, result.rows[0].password);
    if (!match) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await hashPassword(newPassword);
    await pool.query(`UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [newHash, req.user.id]);

    await writeAuditLog(req, 'password_change', `${req.user.role} changed their password`);
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const uploadMyProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const roleTable = ROLE_TABLES[req.user.role];
    if (!roleTable) {
      return res.status(400).json({ error: 'Invalid user role.' });
    }

    const result = await uploadBufferToCloudinary(req.file.buffer, 'image', req.file.originalname);
    await pool.query(
      `UPDATE ${roleTable} SET photo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
      [result.secure_url, req.user.id]
    );

    await writeAuditLog(req, 'profile_photo_update', `${req.user.role} updated profile picture`);
    res.json({ message: 'Profile picture uploaded successfully.', photoUrl: result.secure_url });
  } catch (err) {
    console.error('Upload profile picture error:', err);
    res.status(500).json({ error: 'Server error during upload.' });
  }
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  uploadMyProfilePicture,
};
