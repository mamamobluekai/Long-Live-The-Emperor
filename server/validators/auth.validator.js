const { body, validationResult } = require('express-validator');
const { passwordPolicyValidator, validateConfirmation } = require('../utils/passwordPolicy');

const registerValidation = [
  body('studentId')
    .trim()
    .notEmpty().withMessage('Student ID is required')
    .isLength({ max: 50 }).withMessage('Student ID is too long')
    .escape(),

  body('firstName')
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('First name is required')
    .escape(),

  body('lastName')
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Last name is required')
    .escape(),

  body('middleName').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Middle name is too long').escape(),
  body('section').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Section is too long').escape(),
  body('strand').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 255 }).withMessage('Strand is too long').escape(),
  body('school').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 255 }).withMessage('School is too long').escape(),
  body('gender').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 20 }).withMessage('Gender is too long').escape(),

  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),

  // The student chooses their own password here and it stays theirs until they
  // change it, so it is held to the full shared strength policy.
  body('password').custom(passwordPolicyValidator),

  // Registration always sends both fields from the form, so a missing
  // confirmation is a client bug rather than an optional extra.
  body('confirmPassword')
    .custom((value, { req }) => {
      const problem = validateConfirmation(req.body.password, value);
      if (problem) throw new Error(problem);
      return true;
    }),

  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 20 }).withMessage('Phone number is too long')
    .escape(),
];


const loginValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required'),
];

const forgotValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
];

// Used by the emailed set-password link on an approved account, so the same
  // policy applies as at registration.
const resetValidation = [
  body('token')
    .notEmpty().withMessage('Reset token is required'),

  body('password').custom(passwordPolicyValidator),

  body('confirmPassword')
    .custom((value, { req }) => {
      const problem = validateConfirmation(req.body.password, value);
      if (problem) throw new Error(problem);
      return true;
    }),
];

const verifyTokenValidation = [
  body('token')
    .notEmpty().withMessage('Reset token is required'),
];

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed.',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

module.exports = {
  registerValidation,
  loginValidation,
  forgotValidation,
  resetValidation,
  verifyTokenValidation,
  handleValidation,
};