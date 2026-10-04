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
      const { message } = mapErrorResponse(data);
      throw new Error(message);
    }
    return data;
  } catch (err) {
    const { message } = mapErrorResponse({ error: err.message });
    throw new Error(message, { cause: err });
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
