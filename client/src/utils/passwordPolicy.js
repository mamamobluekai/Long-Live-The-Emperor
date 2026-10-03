// Client mirror of server/utils/passwordPolicy.js.
//
// The server is the authority - it re-checks every password it receives - but
// validating as the user types avoids a round trip and a generic "Validation
// failed." message. Both must stay in step: the rule is 8+ characters with at
// least one uppercase letter, one lowercase letter, and one digit.

export const PASSWORD_REQUIREMENTS_TEXT =
  'At least 8 characters with an uppercase letter, a lowercase letter, and a number.';

/**
 * @returns {string|null} null when the password is acceptable, otherwise the
 *   reason to show.
 */
export function getPasswordProblem(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required.';
  }

  if (password.length < 8) {
    return 'Password must be at least 8 characters.';
  }

  if (password.length > 128) {
    return 'Password must be 128 characters or fewer.';
  }

  if (!/[a-z]/.test(password)) {
    return 'Password must include a lowercase letter.';
  }

  if (!/[A-Z]/.test(password)) {
    return 'Password must include an uppercase letter.';
  }

  if (!/[0-9]/.test(password)) {
    return 'Password must include a number.';
  }

  return null;
}

// True once the password satisfies every rule. Use this to enable a submit
// button; use `getPasswordProblem` when you need to say why.
export function isPasswordStrongEnough(password) {
  return getPasswordProblem(password) === null;
}

/**
 * @returns {string|null} null when the two entries agree.
 */
export function getConfirmationProblem(password, confirmPassword) {
  if (!confirmPassword) {
    return 'Please confirm your password.';
  }

  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }

  return null;
}

// Combined check for a set/change form: returns the first problem found, or
// null when the password is strong and confirmed.
export function getPasswordFormProblem(password, confirmPassword) {
  return getPasswordProblem(password) || getConfirmationProblem(password, confirmPassword);
}