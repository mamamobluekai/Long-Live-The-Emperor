

const ERROR_RULES = [
  // --- Auth: locked account (capture remaining wait time when present) ---
  {
    match: /account temporarily locked.*?try again in\s*([^.]+)\./i,
    friendly: (m) =>
      `Your account was temporarily locked after too many failed login attempts. Please try again in ${m[1].trim()}.`,
  },
  {
    match: /account temporarily locked/i,
    friendly: () =>
      'Your account was temporarily locked after too many failed login attempts. Please wait a few minutes before trying again.',
  },

  // --- Auth: role mismatch (capture the expected role when present) ---
  {
    match: /this account is not registered as a\s*([a-z ]+)?/i,
    friendly: (m) =>
      m[1] && m[1].trim()
        ? `This account is not registered as a ${m[1].trim()}. Please choose the correct role and try again.`
        : 'The selected role does not match this account. Please choose the correct role and try again.',
  },

  // --- Auth: credentials / fields ---
  { match: 'Invalid email or password.', friendly: 'The email or password you entered is incorrect. Please double-check and try again.' },
  { match: 'Email and password are required.', friendly: 'Please enter both your email and password to sign in.' },
  { match: 'Access denied. Admin privileges required.', friendly: 'This account does not have administrator privileges. Please use the standard login instead.' },
  { match: 'Your account is still pending approval.', friendly: 'Your account is still pending approval. You will be notified once a coordinator approves it.' },
  { match: 'Your account was not approved. Contact your coordinator or admin.', friendly: 'Your account was not approved. Please contact your coordinator or administrator for assistance.' },
  { match: 'Your account was not approved. Contact your administrator.', friendly: 'Your account was not approved. Please contact your administrator for assistance.' },
  { match: /too many login attempts/i, friendly: 'Too many login attempts. Please wait a few minutes before trying again.' },
  { match: 'User not found or cannot set password.', friendly: 'We could not find your account. Please check your credentials and try again.' },
  { match: 'User not found.', friendly: 'We could not find your account. Please check your credentials and try again.' },

  // --- Registration ---
  { match: 'Email already registered.', friendly: 'This email address is already registered. Please sign in instead.' },
  { match: 'Student ID already registered.', friendly: 'This student ID is already registered. Please use a different ID or sign in instead.' },
  { match: /passwords do not match/i, friendly: 'The passwords you entered do not match. Please check and try again.' },
  { match: 'Invalid email address.', friendly: 'Please enter a valid email address (e.g. name@example.com).' },
  { match: 'Password must be at least 8 characters.', friendly: 'Your password must be at least 8 characters long.' },
  { match: 'Password is required', friendly: 'Please enter your password.' },
  { match: 'Missing required fields.', friendly: 'Please fill in all required fields.' },
  { match: 'Validation failed.', friendly: 'Please check the information you entered and try again.' },

  // --- Uploads ---
  { match: 'Logo upload failed', friendly: 'Logo upload failed. Please try again.' },
  { match: 'Upload failed', friendly: 'Upload failed. Please check your file and try again.' },

  // --- Session / token expiry ---
  { match: /invalid or expired token/i, friendly: 'Your session has expired. Please log in again.' },
  { match: /session has been revoked/i, friendly: 'You have been signed out. Please log in again.' },
  { match: /access denied\. no token provided/i, friendly: 'You are not signed in. Please log in again.' },
  { match: /no refresh token provided|invalid or expired refresh token|refresh token is no longer valid/i, friendly: 'Your session has expired. Please log in again.' },
  { match: /account is not active|account no longer exists/i, friendly: 'Your account is no longer active. Please contact your administrator.' },

  // --- Generic server errors ---
  { match: /invalid or missing csrf token/i, friendly: 'Your session expired before the request could be verified. Please refresh the page and try again.' },
  { match: 'Server error during login.', friendly: 'Something went wrong while signing in. Please try again in a moment.' },
  { match: 'Server error during registration.', friendly: 'Something went wrong while creating your account. Please try again in a moment.' },
  { match: 'Server error.', friendly: 'Something went wrong on our end. Please try again in a moment.' },
  { match: 'Request failed.', friendly: 'Something went wrong. Please try again in a moment.' },

  // --- Connectivity (also covers the lowercase-keyword fallback the old code had) ---
  { match: /network\/cors|cors|failed to fetch|network error/i, friendly: 'Unable to connect to the server. Please check your internet connection and try again.' },
  { match: /timeout/i, friendly: 'The request timed out. Please check your internet connection and try again.' },
];

const DEFAULT_MESSAGE = 'Something went wrong. Please try again.';

// Used when the server flags maintenance but sends no reason.
export const MAINTENANCE_FALLBACK_MESSAGE =
  'The system is temporarily unavailable while we perform scheduled maintenance. Please try again later.';

/**
 * Short heading for the login toast, keyed by the server's failure code.
 *
 * The server already sends a full sentence explaining what went wrong
 * (see server/utils/loginErrors.js). These titles only label the toast, so the
 * user sees "Wrong password" next to the full explanation rather than having to
 * read the whole sentence to work out what went wrong.
 */
export const LOGIN_ERROR_TITLES = {
  MISSING_CREDENTIALS: 'Missing details',
  ACCOUNT_NOT_FOUND: 'No account found',
  WRONG_PASSWORD: 'Wrong password',
  WRONG_ROLE_ADMIN: 'Wrong sign-in page',
  WRONG_ROLE_SELECTED: 'Wrong role selected',
  ACCOUNT_PENDING: 'Awaiting approval',
  ACCOUNT_DISAPPROVED_ADMIN: 'Account not approved',
  ACCOUNT_DISAPPROVED_USER: 'Account not approved',
  ACCOUNT_LOCKED: 'Account locked',
  MAINTENANCE: 'System maintenance',
  PERIOD_CLOSED: 'Outside immersion period',
  SERVER_ERROR: 'Sign-in problem',
  INVALID_CREDENTIALS: 'Sign-in failed',
};

/**
 * Title for a login failure, falling back to a neutral heading.
 */
export function getLoginErrorTitle(code) {
  return LOGIN_ERROR_TITLES[code] || 'Sign-in failed';
}

/**
 * Convert a raw error string into a user-friendly message.
 *
 * An unrecognised message is returned as-is rather than replaced with the
 * generic default. The rules above exist to reword *legacy* server strings that
 * were written for developers; the current login endpoints send finished,
 * user-facing sentences ("That password is incorrect..."), and collapsing those
 * into "Something went wrong" is what made correct errors look vague.
 *
 * @param {string} rawMessage
 * @returns {string}
 */
export function getErrorMessage(rawMessage) {
  if (!rawMessage) return DEFAULT_MESSAGE;

  const msg = String(rawMessage).trim();

  for (const rule of ERROR_RULES) {
    if (rule.match instanceof RegExp) {
      const m = msg.match(rule.match);
      if (m) return typeof rule.friendly === 'function' ? rule.friendly(m) : rule.friendly;
    } else {
      const key = rule.match;
      if (msg === key || msg.toLowerCase().startsWith(key.toLowerCase())) {
        return typeof rule.friendly === 'function' ? rule.friendly() : rule.friendly;
      }
    }
  }

  // Not a legacy string. Trust the server's wording.
  return msg;
}

/**
 * Normalize an error API response body into a friendly, UI-ready shape.
 * @param {{error?: string, message?: string, msg?: string, code?: string, errors?: any[], maintenance?: boolean, startedAt?: string, estimatedEnd?: string}} data
 * @returns {{message: string, code?: string, maintenance?: boolean, startedAt?: string, estimatedEnd?: string}}
 */
export function mapErrorResponse(data) {
  if (!data) return { message: DEFAULT_MESSAGE };

  // The maintenance reason is written by an admin for end users, so surface it
  // verbatim instead of running it through the generic rules. The dedicated
  // maintenance screen takes priority over whatever the current page shows.
  if (data.maintenance) {
    return {
      message: data.error || data.message || MAINTENANCE_FALLBACK_MESSAGE,
      code: data.code,
      maintenance: true,
      startedAt: data.startedAt,
      estimatedEnd: data.estimatedEnd,
    };
  }

  const rawMessage = data.error || data.message || data.msg || '';
  return { message: getErrorMessage(rawMessage), code: data.code };
}