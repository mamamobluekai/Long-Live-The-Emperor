// Cookie attributes for the refresh token, in one place so the set, rotate and
// clear calls cannot drift apart.
//
// SameSite: the SPA and the API are different sites in production
// (vercel.app -> onrender.com). A `strict` cookie is withheld on cross-site
// requests, so the refresh token would never be presented to
// POST /api/users/refresh: silent refresh would always fail and every user
// would be logged out after the 1h access token expired.
//
// `none` requires `secure`, which is already conditional on production and is
// fine because both origins are HTTPS. Locally the app stays on `lax`, where
// same-site rules still apply and there is no reason to widen the cookie.
//
// The `secure` flag also has to match on clearCookie, otherwise the browser
// treats it as a different cookie and leaves the original in place.

function getRefreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  };
}

module.exports = { getRefreshCookieOptions };