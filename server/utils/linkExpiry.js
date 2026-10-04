// How long an emailed link stays usable.
//
// This covers every link that lands in an inbox and is redeemed on
// /set-password?token= - the approval link sent when an account is approved,
// and the password-reset link from "Forgot password". They share one table
// (password_reset_tokens) and one consuming page, so they share one lifetime.
//
// Three days rather than minutes: a student or teacher often does not open the
// mail the same day it arrives, and a link that has already expired by the time
// they read it just turns into a support request and a resend.
const LINK_TTL_MINUTES = 3 * 24 * 60; // 4320

// Wording for the same window, for the mail bodies and the on-screen copy.
// Preferred over printing the raw minute count, which would read "valid for
// 4320 minutes".
const LINK_TTL_LABEL = '3 days';

module.exports = { LINK_TTL_MINUTES, LINK_TTL_LABEL };