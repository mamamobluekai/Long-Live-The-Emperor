import { mapErrorResponse } from '../utils/errors';
import { reportMaintenance } from './maintenanceApi';
import { withCsrf, ensureCsrfToken } from '../utils/csrf';
import { API_BASE } from '../config/api';



async function fetchJsonOrThrow(url, options) {
  try {
    const response = await fetch(url, options);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // A 503 from login means maintenance mode, not bad credentials, so tell
      // the app before the friendly-message mapping hides that distinction.
      if (data && data.maintenance) reportMaintenance(data);
      const { message, code } = mapErrorResponse(data);
      // The code identifies the failure (wrong password, wrong role, locked,
      // pending...) so the sign-in form can label its toast instead of showing
      // one undifferentiated message for every failure. `data` is attached too
      // because the wrong-role response carries the account's real role, which
      // the form uses to switch tabs for the user.
      throw Object.assign(new Error(message), { code, status: response.status, data });
    }
    return data;
  } catch (err) {
    // Already a mapped API error - rethrow as-is rather than running its
    // friendly text through the rules a second time.
    if (err && err.code !== undefined && err.status) throw err;
    const { message, code } = mapErrorResponse({ error: err.message });
    throw Object.assign(new Error(message), { code, cause: err });
  }
}

export async function loginUser(credentials) {
  const url = `${API_BASE}/users/login`;
  // Login is the first mutating request a fresh browser makes, and it may have
  // no CSRF token yet (the cookie lives on the API origin and cannot be read
  // cross-site). Fetch one before sending.
  await ensureCsrfToken();
  return fetchJsonOrThrow(url, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(credentials),
  });
}

export async function registerUser(payload) {
  const url = `${API_BASE}/users/register`;
  return fetchJsonOrThrow(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
}

export async function forgotPassword(email) {
  const url = `${API_BASE}/users/forgot-password`;
  return fetchJsonOrThrow(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(payload) {
  const url = `${API_BASE}/users/reset-password`;
  return fetchJsonOrThrow(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
}

export async function verifyResetToken(token) {
  const url = `${API_BASE}/users/verify-reset-token`;
  return fetchJsonOrThrow(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token }),
  });
}
