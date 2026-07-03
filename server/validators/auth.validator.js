const { body, validationResult } = require('express-validator');

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

  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),

  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),

  // registerStudent only checks this if it's present (`!== undefined`),
  // so keep it optional here too rather than forcing it.
  body('confirmPassword')
    .optional({ nullable: true })
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
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
  handleValidation,
};