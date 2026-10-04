// One definition of every reason a login can fail.
//
// The login handlers used to collapse almost everything into a single
// "Invalid email or password." That was deliberate anti-enumeration (issue #8),
// but in practice it left a user with no idea what to fix: choosing the wrong
// role tab reported a credentials problem, and a pending account reported a
// wrong password. Each failure now has its own code and its own sentence.
//
// The code is what the client keys off; the message is the human wording. The
// client shows it in a toast (both login forms use useToast) rather than as
// inline form text.
//
// On the trade-off: distinct messages for "no such account", "wrong password"
// and "locked" do let someone probe which emails are registered. That is a real
// cost, and it is why it is a switch rather than a hardcoded decision. With
// LOGIN_REVEALS_REASON=false the server falls back to one generic message and a
// generic code, so the client shows one bland toast.
const { incrementLoginAttempts } = require('./loginAttempts');

// Duplicated rather than imported from the approval mail service, so the login
// path does not pull in the mail transport to render a role name.
const ROLE_LABELS = {
  student: 'Student',
  teacher: 'Teacher',
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
  admin: 'Admin',
};

const roleLabel = (role) => ROLE_LABELS[role] || 'Work Immersion';

// Default is to explain. Set to false on a deployment that must not confirm
// whether an address is registered.
function revealsReason() {
  return String(process.env.LOGIN_REVEALS_REASON || 'true').toLowerCase() !== 'false';
}

// The single fallback text used in privacy mode.
const GENERIC = 'Invalid email or password.';

// Builds the failure response and sends it.
//
//   code   machine-readable reason the client maps to a toast style and title
//   detail substitutions for the wording: lockout minutes remaining, the role
//           the account actually holds, the role tab that was clicked
//   extra  extra body fields the client needs (maintenance window, period dates)
function sendLoginError(res, code, detail, extra) {
  const reasons = {
    MISSING_CREDENTIALS: {
      status: 400,
      message: 'Enter both your email address and your password.',
    },
    ACCOUNT_NOT_FOUND: {
      status: 401,
      message: 'No account was found with that email address. Check for typos, or register if you are new.',
    },
    WRONG_PASSWORD: {
      status: 401,
      message: 'That password is incorrect. Try again, or use "Forgot password" to reset it.',
    },
    WRONG_ROLE_ADMIN: {
      status: 401,
      message: (d) => `This account is registered as ${roleLabel(d.role)}, not as an administrator. Use the ${roleLabel(d.role)} sign-in page instead.`,
    },
    WRONG_ROLE_SELECTED: {
      status: 401,
      message: (d) => `This account is registered as ${roleLabel(d.role)}. You signed in on the ${roleLabel(d.selected)} tab - switch to the ${roleLabel(d.role)} one.`,
    },
    ACCOUNT_PENDING: {
      status: 403,
      message: 'Your account is waiting for approval. You will get an email as soon as an administrator activates it.',
    },
    ACCOUNT_DISAPPROVED_ADMIN: {
      status: 403,
      message: 'This account was not approved. Contact your administrator to have it activated again.',
    },
    ACCOUNT_DISAPPROVED_USER: {
      status: 403,
      message: 'This account was not approved. Contact your coordinator or an administrator to have it activated again.',
    },
    ACCOUNT_LOCKED: {
      status: 429,
      message: (d) => `Too many failed attempts. This account is locked for another ${d.minutes} minute${d.minutes === 1 ? '' : 's'}.`,
    },
    MAINTENANCE: {
      status: 503,
      message: (d) => d.detail || 'The system is under maintenance. Please try again shortly.',
    },
    PERIOD_CLOSED: {
      status: 403,
      message: (d) => d.detail || 'Login is not available during this period.',
    },
    SERVER_ERROR: {
      status: 500,
      message: 'Something went wrong on our side while signing you in. Please try again.',
    },
  };

  const entry = reasons[code] || reasons.SERVER_ERROR;

  // Privacy mode: one message, one code, no detail worth inferring from.
  if (!revealsReason()) {
    return res.status(entry.status).json({ error: GENERIC, code: 'INVALID_CREDENTIALS' });
  }

  const message = typeof entry.message === 'function' ? entry.message(detail || {}) : entry.message;
  return res.status(entry.status).json({ error: message, code, ...(extra || {}) });
}

// Counts one failed attempt. Both controllers use this so the lockout behaves
// identically on either sign-in page.
async function recordFailure(email, ip) {
  await incrementLoginAttempts(email, ip);
}

module.exports = { sendLoginError, recordFailure, revealsReason, GENERIC };