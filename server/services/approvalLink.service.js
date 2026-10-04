// Single home for the "your account was approved, choose your password" flow.
//
// Every approval route (staff, coordinator, student, bulk, and the admin status
// toggle) used to build its own token and copy its own email, which meant a fix
// in one place silently left the others behind. They all funnel through here.
//
// There is deliberately no temporary password: the recipient opens the emailed
// one-time link and sets and confirms their own password on /set-password?token=.
// Possession of the link is the only credential they need.
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../db');

// How long an emailed set-your-password link stays usable after approval.
const APPROVAL_TOKEN_TTL_MINUTES = 60;

const ROLE_LABELS = {
  student: 'Student',
  teacher: 'Teacher',
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
  admin: 'Admin',
};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

if (process.env.EMAIL_USER) {
  transporter.verify((err) => {
    if (err) {
      console.error('Email transporter verification failed:', err.message);
    } else {
      console.log('Email transporter ready.');
    }
  });
}

function getClientUrl() {
  return process.env.CLIENT_URL || 'http://localhost:5173';
}

function roleLabelFor(role) {
  return ROLE_LABELS[role] || 'Work Immersion';
}

// Names come from Excel imports and typed forms, so escape them before they are
// interpolated into the HTML body.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Issues a one-time set-password token. Pass an explicit `client` to run inside
// a caller's transaction.
async function issueApprovalToken(userId, client = pool) {
  // Drop any link still in flight so an older email cannot be used after a
  // re-approval, and only one live link exists per account at a time.
  await client.query(
    `DELETE FROM password_reset_tokens
     WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP`,
    [userId],
  );

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + APPROVAL_TOKEN_TTL_MINUTES * 60 * 1000);

  await client.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, token, expiresAt],
  );

  return token;
}

// Called when an account is deactivated or rejected. Without this an approval
// link mailed before the decision would still set a password, and resetPassword
// writes status back to 'approved' - quietly undoing the deactivation.
async function revokeApprovalTokens(userId, client = pool) {
  await client.query(
    `DELETE FROM password_reset_tokens WHERE user_id = $1`,
    [userId],
  );
}

function buildApprovalEmailHtml(user, token, expiresInMinutes = APPROVAL_TOKEN_TTL_MINUTES) {
  const roleLabel = roleLabelFor(user.role);
  const setPasswordUrl = `${getClientUrl()}/set-password?token=${encodeURIComponent(token)}`;
  const name = escapeHtml(`${user.first_name || ''} ${user.last_name || ''}`.trim());

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2a5298;">Your Account Has Been Approved</h2>
      <p>Hello${name ? ` <strong>${name}</strong>` : ''},</p>
      <p>Your <strong>${escapeHtml(roleLabel)}</strong> account in the Work Immersion
         Monitoring System has been <strong>approved</strong>. You can sign in as soon as
         you set your password.</p>
      <p><strong>Email:</strong> ${escapeHtml(user.email)}</p>
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(setPasswordUrl)}" style="background: #2a5298; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Set Your Password
        </a>
      </p>
      <p style="color: #666; font-size: 12px;">
        This link is valid for ${expiresInMinutes} minutes and can be used only once.
        If the button does not work, copy this address into your browser:<br />
        ${escapeHtml(setPasswordUrl)}
      </p>
      <p style="color: #666; font-size: 12px;">
        After setting it you can sign in with your email, and change your password again
        at any time from your profile settings. Your password needs at least 8 characters,
        including an uppercase letter, a lowercase letter, and a number.
      </p>
      <p style="color: #666; font-size: 12px;">Marinduque National High School - Work Immersion Office</p>
    </div>
  `;
}

// Best-effort: returns true when the transport accepted the message, so the
// caller can tell the admin about a delivered link versus a silently dropped one.
async function sendApprovalEmail(user, token, expiresInMinutes = APPROVAL_TOKEN_TTL_MINUTES) {
  const roleLabel = roleLabelFor(user.role);
  try {
    await transporter.sendMail({
      from: `"Work Immersion System" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `Your Work Immersion ${roleLabel} Account is Approved`,
      html: buildApprovalEmailHtml(user, token, expiresInMinutes),
    });
    console.log(`Approval email sent to ${user.email}`);
    return true;
  } catch (emailErr) {
    console.error(`Failed to send approval email to ${user.email}:`, emailErr.message);
    return false;
  }
}

// Issues a fresh link and mails it. The approve routes use this.
async function issueAndEmailApprovalLink(user, client = pool) {
  const token = await issueApprovalToken(user.id, client);
  const emailSent = await sendApprovalEmail(user, token);
  return { emailSent, token };
}

// Mails a brand new link to an account that is already approved - the recovery
// path when the original mail bounced or expired. Because it issues a new token,
// only the newest link works and any earlier one stops working.
async function resendApprovalLink(user, client = pool) {
  const { emailSent } = await issueAndEmailApprovalLink(user, client);
  return { emailSent };
}

// Loads the user row an approval mail needs: id, email, role, and the name from
// whichever role table holds it. Returns null when the id is not a real user.
async function getApprovalRecipient(userId, client = pool) {
  const result = await client.query(
    `SELECT u.id, u.email, u.role,
            COALESCE(s.first_name, t.first_name, sup.first_name, c.first_name, a.first_name, '') AS first_name,
            COALESCE(s.last_name,  t.last_name,  sup.last_name,  c.last_name,  a.last_name,  '') AS last_name
     FROM users u
     LEFT JOIN students s      ON u.id = s.user_id  AND u.role = 'student'
     LEFT JOIN teachers t      ON u.id = t.user_id  AND u.role = 'teacher'
     LEFT JOIN supervisors sup ON u.id = sup.user_id AND u.role = 'supervisor'
     LEFT JOIN coordinators c  ON u.id = c.user_id  AND u.role = 'coordinator'
     LEFT JOIN admins a        ON u.id = a.user_id  AND u.role = 'admin'
     WHERE u.id = $1`,
    [userId],
  );
  return result.rows[0] || null;
}

module.exports = {
  APPROVAL_TOKEN_TTL_MINUTES,
  ROLE_LABELS,
  pool,
  issueApprovalToken,
  issueAndEmailApprovalLink,
  revokeApprovalTokens,
  resendApprovalLink,
  getApprovalRecipient,
  buildApprovalEmailHtml,
  sendApprovalEmail,
  roleLabelFor,
};

// PLACEHOLDER_BUILDERS