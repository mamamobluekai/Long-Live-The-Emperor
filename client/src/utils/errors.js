

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

  // --- Generic server errors ---
  { match: 'Server error during login.', friendly: 'Something went wrong while signing in. Please try again in a moment.' },
  { match: 'Server error during registration.', friendly: 'Something went wrong while creating your account. Please try again in a moment.' },
  { match: 'Server error.', friendly: 'Something went wrong on our end. Please try again in a moment.' },
  { match: 'Request failed.', friendly: 'Something went wrong. Please try again in a moment.' },

  // --- Connectivity (also covers the lowercase-keyword fallback the old code had) ---
  { match: /network\/cors|cors|failed to fetch|network error/i, friendly: 'Unable to connect to the server. Please check your internet connection and try again.' },
  { match: /timeout/i, friendly: 'The request timed out. Please check your internet connection and try again.' },
];

const DEFAULT_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Convert a raw error string into a user-friendly message.
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

  return DEFAULT_MESSAGE;
}

/**
 * Normalize an error API response body into a friendly, UI-ready shape.
 * @param {{error?: string, message?: string, msg?: string, errors?: any[]}} data
 * @returns {{message: string}}
 */
export function mapErrorResponse(data) {
  if (!data) return { message: DEFAULT_MESSAGE };

  const rawMessage = data.error || data.message || data.msg || '';
  return { message: getErrorMessage(rawMessage) };
}