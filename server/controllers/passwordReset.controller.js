const crypto = require('crypto');
const pool = require('../db');
const nodemailer = require('nodemailer');
const { hashPassword } = require('../utils/hashPassword');

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

const FORGOT_PASSWORD_TOKEN_BYTES = 32;
const FORGOT_PASSWORD_TOKEN_TTL_MINUTES = 30;

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const trimmedEmail = String(email).trim().toLowerCase();

    const result = await pool.query(
      `SELECT id, role, status FROM users WHERE email = $1`,
      [trimmedEmail]
    );

    // Always respond the same way whether or not the user exists, to avoid
    // leaking which emails are registered.
    if (result.rows.length === 0) {
      return res.json({
        message: 'If an accepted account exists for that email, a password reset link has been sent.',
      });
    }

    const user = result.rows[0];

    // Only accepted (approved/active) accounts can reset their password.
    if (user.status !== 'approved') {
      return res.json({
        message: 'If an accepted account exists for that email, a password reset link has been sent.',
      });
    }

    const token = crypto.randomBytes(FORGOT_PASSWORD_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + FORGOT_PASSWORD_TOKEN_TTL_MINUTES * 60 * 1000);

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, token, expiresAt]
    );

    const resetLink = `${getClientUrl()}/set-password?token=${token}`;

    let subject = 'Password Reset Instructions';
    let html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2a5298;">Password Reset Request</h2>
        <p>Hello,</p>
        <p>You recently requested to reset your password for the Work Immersion Monitoring System.</p>
        <p>Click the button below to set a new password. This link is valid for ${FORGOT_PASSWORD_TOKEN_TTL_MINUTES} minutes.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${resetLink}" style="background: #3b82f6; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">Set New Password</a>
        </p>
        <p>If you did not request a password reset, you can safely ignore this email.</p>
        <p style="color: #666; font-size: 12px;">Marinduque National High School - Work Immersion Office</p>
      </div>
    `;

    try {
      await transporter.sendMail({
        from: `"Work Immersion System" <${process.env.EMAIL_USER}>`,
        to: trimmedEmail,
        subject,
        html,
      });
      console.log(`Password reset email sent to ${trimmedEmail}`);
    } catch (emailErr) {
      console.error(`Failed to send password reset email to ${trimmedEmail}:`, emailErr.message);
      // The token is still created so the API stays consistent, but we don't
      // expose the email delivery failure to the client.
    }

    return res.json({
      message: 'If an accepted account exists for that email, a password reset link has been sent.',
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Server error while processing your request.' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Reset token is required.' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const tokenResult = await pool.query(
      `SELECT user_id, expires_at FROM password_reset_tokens WHERE token = $1`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired reset token.' });
    }

    const tokenRow = tokenResult.rows[0];

    if (new Date(tokenRow.expires_at) < new Date()) {
      await pool.query(`DELETE FROM password_reset_tokens WHERE token = $1`, [token]);
      return res.status(401).json({ error: 'Invalid or expired reset token.' });
    }

    const hashedPassword = await hashPassword(password);

    await pool.query('BEGIN');

    await pool.query(
      `UPDATE users
       SET password = $1, status = 'approved', updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [hashedPassword, tokenRow.user_id]
    );

    await pool.query(`DELETE FROM password_reset_tokens WHERE token = $1`, [token]);

    await pool.query('COMMIT');

    return res.json({ message: 'Password set successfully. You can now log in.' });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Server error while resetting password.' });
  }
};

const verifyResetToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Reset token is required.' });
    }

    const tokenResult = await pool.query(
      `SELECT user_id, expires_at FROM password_reset_tokens WHERE token = $1`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired reset token.' });
    }

    const tokenRow = tokenResult.rows[0];

    if (new Date(tokenRow.expires_at) < new Date()) {
      await pool.query(`DELETE FROM password_reset_tokens WHERE token = $1`, [token]);
      return res.status(401).json({ error: 'Invalid or expired reset token.' });
    }

    return res.json({ valid: true });
  } catch (err) {
    console.error('Verify reset token error:', err);
    return res.status(500).json({ error: 'Server error while verifying token.' });
  }
};

module.exports = {
  forgotPassword,
  resetPassword,
  verifyResetToken,
};
