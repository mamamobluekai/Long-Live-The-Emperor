// Single source of truth for password strength, shared by every route that sets
// a password: student registration, the emailed set-password/reset flow, and the
// authenticated change-password endpoints.
//
// Previously each site enforced its own rule (usually just "8 characters"), so a
// password accepted on one screen could be rejected on another. Keep the rule
// here and call `validatePassword` everywhere.
//
// Deliberately not enforced: symbol requirements and character-class ordering.
// They push people toward predictable substitutions (Password1!). The rules here
// are the ones that materially raise the guessing cost.

// Stored in `users.password` for accounts that have not chosen one yet (bulk
// uploads, registrations awaiting approval). `users.password` is NOT NULL, so
// these rows need a value; bcrypt-hashing a random string produced a real,
// unknown-to-anyone credential, which is misleading. This sentinel can never be
// produced by hashing, so no submitted password can match it, and the account is
// additionally gated by status = 'pending' at login.
const NO_PASSWORD_SENTINEL = '!no-password-set-yet!';

// What the user is told when a password fails.
function getPasswordRequirements() {
  return 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.';
}

/**
 * @returns {string|null} null when acceptable, otherwise a user-facing reason.
 */
function validatePassword(password) {
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

// Same rule as `validatePassword`, shaped for express-validator's `.custom()`.
// Returns true to pass, or throws to fail the chain.
function passwordPolicyValidator(value) {
  const problem = validatePassword(value);
  if (problem) {
    throw new Error(problem);
  }
  return true;
}

// Confirms the two entries of a set/change form agree. Returns a message on
// mismatch so callers can surface it directly.
function validateConfirmation(password, confirmPassword) {
  if (confirmPassword === undefined || confirmPassword === null || confirmPassword === '') {
    return 'Please confirm your password.';
  }

  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }

  return null;
}

module.exports = {
  NO_PASSWORD_SENTINEL,
  getPasswordRequirements,
  validatePassword,
  passwordPolicyValidator,
  validateConfirmation,
};