const nodemailer = require('nodemailer');

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

// The recipient sets their own password - and confirms it - on the linked page.
// There is deliberately no temporary password: `options.token` is a one-time
// link whose value is the only credential the holder needs, and it expires.
//
// Note this link carries `token`, not `email`. The bare /set-password?email=
// variant is the 'pending' activation path and is refused for approved rows.
function buildStudentApprovalEmailHtml(user, options = {}) {
  const { token, expiresInMinutes = 60 } = options;
  const setPasswordUrl = `${getClientUrl()}/set-password?token=${encodeURIComponent(token)}`;

  return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2a5298;">Account Approved</h2>
          <p>Hello <strong>${user.first_name} ${user.last_name}</strong>,</p>
          <p>Your student account has been approved by your coordinator.</p>
          <p><strong>Email:</strong> ${user.email}</p>
          <p style="margin: 16px 0;">
            Choose a password of your own using the button below. You will confirm it
            before it is saved. This link is valid for ${expiresInMinutes} minutes and can
            be used only once.
          </p>
          <p style="margin: 20px 0;">
            <a href="${setPasswordUrl}" style="background: #2a5298; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Set Your Password
            </a>
          </p>
          <p style="color: #666; font-size: 12px;">After setting your password you can sign in with your email, and change it again at any time from your profile settings.</p>
          <p style="color: #666; font-size: 12px;">Marinduque National High School - Work Immersion Office</p>
        </div>
      `;
}

// Sends the approval mail for a coordinator approving a student. The student
// sets their own password via the emailed one-time token link; there is no
// temporary password involved.
// Returns true when the message was handed to the transport, false on failure.
// The previous version swallowed the error and left the caller unable to tell
// a delivered link from a silently dropped one.
async function sendStudentApprovalEmail(user, options = {}) {
  try {
    await transporter.sendMail({
      from: `"Work Immersion System" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Your Work Immersion Student Account is Approved',
      html: buildStudentApprovalEmailHtml(user, options),
    });
    console.log(`Approval email sent to ${user.email}`);
    return true;
  } catch (emailErr) {
    console.error(`Failed to send approval email to ${user.email}:`, emailErr.message);
    return false;
  }
}

module.exports = {
  buildStudentApprovalEmailHtml,
  sendStudentApprovalEmail,
};