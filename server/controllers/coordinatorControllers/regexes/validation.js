const { requiredInfoFields, emailRegex, phoneRegex } = require('../helpers/constant');

const normalize = (value) => (typeof value === 'string' ? value.trim() : value);

const validateStudentPayload = (body, partial = false) => {
  const errors = {};
  const source = body || {};

  if (!partial) {
    requiredInfoFields.forEach((field) => {
      if (!normalize(source[field])) errors[field] = 'This field is required.';
    });
  }

  ['email', 'guardian_email'].forEach((field) => {
    if (source[field] && !emailRegex.test(source[field])) errors[field] = 'Enter a valid email address.';
  });

  ['contact_number', 'guardian_contact', 'emergency_contact_number'].forEach((field) => {
    if (source[field] && !phoneRegex.test(source[field])) errors[field] = 'Enter a valid phone number.';
  });

  if (source.age && Number(source.age) < 0) errors.age = 'Age must be a positive number.';

  return errors;
};

module.exports = {
  normalize,
  validateStudentPayload,
};