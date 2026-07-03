const rateLimit = require("express-rate-limit")

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: {error: 'Too many login attempts. please try again after 15 minutes.'},
    standardHeaders: true,
    legacyHeaders: false,
})

module.exports = loginLimiter;