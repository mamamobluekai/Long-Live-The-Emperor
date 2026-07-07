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

// Sends the same style of approval email as the admin controller, worded
// for a coordinator approving a student instead of an admin approving staff.
// Includes the temporary password that was generated on approval.
async function sendStudentApprovalEmail(user, tempPassword) {
  try {
    await transporter.sendMail({
      from: `"Work Immersion System" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Your Work Immersion Student Account is Approved',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2a5298;">Account Approved</h2>
          <p>Hello <strong>${user.first_name} ${user.last_name}</strong>,</p>
          <p>Your Student account has been approved by your coordinator. A temporary password was created for you so you can log in right away.</p>
          <p><strong>Email:</strong> ${user.email}</p>
          <p style="margin: 16px 0;">
            <strong>Temporary password:</strong>
            <code style="display: inline-block; background: #f1f5f9; padding: 8px 12px; border-radius: 5px; font-size: 16px; letter-spacing: 1px;">${tempPassword}</code>
          </p>
          <p style="margin: 20px 0;">
            <a href="${getClientUrl()}/login" style="background: #2a5298; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Log In
            </a>
          </p>
          <p style="color: #666; font-size: 12px;">For your security, please change this password after logging in.</p>
          <p style="color: #666; font-size: 12px;">Marinduque National High School - Work Immersion Office</p>
        </div>
      `,
    });
    console.log(`Approval email sent to ${user.email}`);
  } catch (emailErr) {
    console.error(`Failed to send approval email to ${user.email}:`, emailErr.message);
  }
}

module.exports = {
  sendStudentApprovalEmail,
};