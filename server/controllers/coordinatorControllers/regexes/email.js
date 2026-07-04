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
async function sendStudentApprovalEmail(user) {
  try {
    await transporter.sendMail({
      from: `"Work Immersion System" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Your Work Immersion Student Account is Approved',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2a5298;">Account Approved</h2>
          <p>Hello <strong>${user.first_name} ${user.last_name}</strong>,</p>
          <p>Your Student account has been approved by your coordinator. You can now log in to the Work Immersion Management System.</p>
          <p><strong>Email:</strong> ${user.email}</p>
          <p style="margin: 20px 0;">
            <a href="${getClientUrl()}/login" style="background: #2a5298; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Log In
            </a>
          </p>
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