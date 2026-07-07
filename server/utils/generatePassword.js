const crypto = require('crypto');

// Generates a secure, human-readable temporary password.
// Avoids ambiguous characters (0/O, 1/l/I) to reduce typing errors.
const generateTemporaryPassword = (length = 12) => {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  return password;
};

module.exports = { generateTemporaryPassword };
