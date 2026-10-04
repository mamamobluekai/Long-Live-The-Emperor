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
const { NO_PASSWORD_SENTINEL } = require('../utils/passwordPolicy');
const { LINK_TTL_MINUTES, LINK_TTL_LABEL } = require('../utils/linkExpiry');

// How long an emailed set-your-password link stays usable after approval.
// Shared with the forgot-password flow - see utils/linkExpiry.js.
const APPROVAL_TOKEN_TTL_MINUTES = LINK_TTL_MINUTES;

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

// True when the account still carries the never-set-password sentinel, i.e. it
// has no usable credential and must go through the emailed link before it can
// sign in.
//
// This is the difference between the two kinds of account:
//   * A student who self-registered already chose a password on the register
//     page. They only need to be told they were approved - sending them a
//     "set your password" link would ask them to redo something they did.
//   * A student added by Excel upload (and every teacher/supervisor/coordinator
//     account) was created with the sentinel, so the link is the only way in.
function needsPasswordSetup(user) {
  return user?.password === NO_PASSWORD_SENTINEL;
}

// Strips the password hash before a user object is echoed back to a client.
function publicUser(user) {
  if (!user) return user;
  const { password, ...rest } = user;
  return rest;
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

// What the recipient can do next, once signed in. Kept short and per-role so
// the mail tells them something useful instead of just "you are approved".
const NEXT_STEP = {
  student:
    'You can now sign in and start logging your daily immersion hours, uploading your documentation, and tracking your requirement progress.',
  teacher:
    'You can now sign in to review your class attendance in the field and handle your student documentation.',
  supervisor:
    'You can now sign in to review your interns, verify attendance at the host site, and certify requirements.',
  coordinator:
    'You can now sign in to approve requirements, assign supervisors, and manage batches.',
};

// `token` is null when the account already has a usable password. That is the
// self-registered student case: they already chose a password on the register
// page, so there is nothing to set. They get a plain "you are approved, go use
// the app" notice with a button straight to the app - no password setup, no
// token. A `token` means the account was created by Excel upload and still has
// no password at all, so it gets the set-password link instead.
function buildApprovalEmailHtml(user, token) {
  const roleLabel = roleLabelFor(user.role);
  const name = escapeHtml(`${user.first_name || ''} ${user.last_name || ''}`.trim());

  const footer = `
      <p style="color: #666; font-size: 12px;">Marinduque National High School - Work Immersion Office</p>
    </div>
  `;

  if (!token) {
    const appUrl = escapeHtml(`${getClientUrl()}/login`);
    const nextStep = NEXT_STEP[user.role] || 'You can now sign in to the Work Immersion app.';

    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2a5298;">You Have Been Approved</h2>
      <p>Hello${name ? ` <strong>${name}</strong>` : ''},</p>
      <p>Good news &mdash; your <strong>${escapeHtml(roleLabel)}</strong> account in the
         Work Immersion Monitoring System has been <strong>approved</strong>. You can use
         the app now; there is nothing else you need to set up.</p>
      <p>${escapeHtml(nextStep)}</p>
      <p style="margin: 20px 0;">
        <a href="${appUrl}" style="background: #2a5298; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Open Work Immersion App
        </a>
      </p>
      <p><strong>Sign in with this email:</strong> ${escapeHtml(user.email)}</p>
      <p style="color: #666; font-size: 12px;">
        Use the password you created when you registered. If you have forgotten it, use the
        "Forgot password" link on the sign-in page and we will email you a link to set a new one.
      </p>
      ${footer}
  `;
  }

  const setPasswordUrl = `${getClientUrl()}/set-password?token=${encodeURIComponent(token)}`;
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
        This link is valid for ${LINK_TTL_LABEL} and can be used only once.
        If the button does not work, copy this address into your browser:<br />
        ${escapeHtml(setPasswordUrl)}
      </p>
      <p style="color: #666; font-size: 12px;">
        After setting it you can sign in with your email, and change your password again
        at any time from your profile settings. Your password needs at least 8 characters,
        including an uppercase letter, a lowercase letter, and a number.
      </p>
      ${footer}
  `;
}

// Plain-text twin of the HTML body. Gmail filters aggressively and a message
// with only an HTML part is more likely to land in spam, so every mail carries
// both.
function buildApprovalEmailText(user, token) {
  const roleLabel = roleLabelFor(user.role);
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  const signOff = 'Marinduque National High School - Work Immersion Office';

  if (!token) {
    const nextStep = NEXT_STEP[user.role] || 'You can now sign in to the Work Immersion app.';
    return [
      'You Have Been Approved',
      '',
      name ? `Hello ${name},` : 'Hello,',
      '',
      `Good news - your ${roleLabel} account in the Work Immersion Monitoring System has been approved. You can use the app now; there is nothing else you need to set up.`,
      '',
      nextStep,
      '',
      `Sign in with this email: ${user.email}`,
      'Use the password you created when you registered. If you have forgotten it, use the "Forgot password" link on the sign-in page.',
      '',
      signOff,
    ].join('\n');
  }

  return [
    'Your Account Has Been Approved',
    '',
    name ? `Hello ${name},` : 'Hello,',
    '',
    `Your ${roleLabel} account in the Work Immersion Monitoring System has been approved. You can sign in as soon as you set your password.`,
    '',
    `Set your password: ${getClientUrl()}/set-password?token=${encodeURIComponent(token)}`,
    '',
    `This link is valid for ${LINK_TTL_LABEL} and can be used only once.`,
    'Your password needs at least 8 characters, including an uppercase letter, a lowercase letter, and a number.',
    '',
    signOff,
  ].join('\n');
}

// Best-effort: returns true when the transport accepted the message, so the
// caller can tell the admin about a delivered mail versus a silently dropped one.
async function sendApprovalEmail(user, token) {
  const roleLabel = roleLabelFor(user.role);
  // No token means the recipient already has a password, so lead with the news
  // rather than the link.
  const subject = token
    ? `Your Work Immersion ${roleLabel} Account is Approved`
    : `You're approved - sign in to the Work Immersion app`;

  try {
    await transporter.sendMail({
      from: `"Work Immersion System" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject,
      html: buildApprovalEmailHtml(user, token),
      text: buildApprovalEmailText(user, token),
    });
    console.log(`Approval email sent to ${user.email}`);
    return true;
  } catch (emailErr) {
    console.error(`Failed to send approval email to ${user.email}:`, emailErr.message);
    return false;
  }
}

// The single entry point every approve route uses.
//
// If the account still has no password (Excel upload) it mints a one-time
// set-password link and mails it. If the account already chose a password at
// registration it only sends the approval notice - no link, nothing to redo.
async function issueAndEmailApprovalLink(user, client = pool) {
  if (!user || !user.email) {
    // Nothing sensible to mail - an empty address would just throw inside the
    // transport. Report "not sent" so the caller can still respond.
    return { emailSent: false, token: null, linkSent: false };
  }

  const needsLink = needsPasswordSetup(user);
  const token = needsLink ? await issueApprovalToken(user.id, client) : null;
  const emailSent = await sendApprovalEmail(user, token);
  return { emailSent, token, linkSent: needsLink };
}

// Mails the approval notice again - the recovery path when the original mail
// bounced or expired. Accounts without a password get a brand new one-time
// token (which also invalidates any earlier link); accounts that already have a
// password get a plain notice.
async function resendApprovalLink(user, client = pool) {
  const { emailSent, linkSent } = await issueAndEmailApprovalLink(user, client);
  return { emailSent, linkSent };
}

// Loads the user row an approval mail needs: id, email, role, the stored
// password (only to decide whether a link is needed - never returned), and the
// name from whichever role table holds it. Null when the id is not a real user.
async function getApprovalRecipient(userId, client = pool) {
  const result = await client.query(
    `SELECT u.id, u.email, u.role, u.password,
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
  LINK_TTL_LABEL,
  ROLE_LABELS,
  pool,
  issueApprovalToken,
  issueAndEmailApprovalLink,
  revokeApprovalTokens,
  resendApprovalLink,
  getApprovalRecipient,
  needsPasswordSetup,
  publicUser,
  buildApprovalEmailHtml,
  buildApprovalEmailText,
  sendApprovalEmail,
  roleLabelFor,
};

// PLACEHOLDER_BUILDERS