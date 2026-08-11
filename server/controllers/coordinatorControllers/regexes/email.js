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

function buildStudentApprovalEmailHtml(user, tempPassword) {
  const setPasswordUrl = `${getClientUrl()}/set-password?email=${encodeURIComponent(user.email)}`;
  const passwordSection = tempPassword
    ? `
          <p style="margin: 16px 0;">
            <strong>Temporary password:</strong>
            <code style="display: inline-block; background: #f1f5f9; padding: 8px 12px; border-radius: 5px; font-size: 16px; letter-spacing: 1px;">${tempPassword}</code>
          </p>
          <p style="color: #666; font-size: 12px;">You can use this temporary password to set your own password through the button below.</p>`
    : `
          <p>Please set your password using the button below so you can sign in securely.</p>`;

  return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2a5298;">Account Approved</h2>
          <p>Hello <strong>${user.first_name} ${user.last_name}</strong>,</p>
          <p>Your student account has been approved by your coordinator.</p>
          <p><strong>Email:</strong> ${user.email}</p>
          ${passwordSection}
          <p style="margin: 20px 0;">
            <a href="${setPasswordUrl}" style="background: #2a5298; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Set Your Password
            </a>
          </p>
          <p style="color: #666; font-size: 12px;">After setting your password, you can log in with your email and the password you chose.</p>
          <p style="color: #666; font-size: 12px;">Marinduque National High School - Work Immersion Office</p>
        </div>
      `;
}

// Sends the same style of approval email as the admin controller, worded
// for a coordinator approving a student instead of an admin approving staff.
// If a temporary password is provided, it is included; otherwise the email
// simply confirms that the student can log in with their existing password.
async function sendStudentApprovalEmail(user, tempPassword) {
  try {
    await transporter.sendMail({
      from: `"Work Immersion System" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Your Work Immersion Student Account is Approved',
      html: buildStudentApprovalEmailHtml(user, tempPassword),
    });
    console.log(`Approval email sent to ${user.email}`);
  } catch (emailErr) {
    console.error(`Failed to send approval email to ${user.email}:`, emailErr.message);
  }
}

module.exports = {
  buildStudentApprovalEmailHtml,
  sendStudentApprovalEmail,
};