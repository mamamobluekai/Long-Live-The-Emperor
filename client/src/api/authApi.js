import { mapErrorResponse } from '../utils/errors';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

async function fetchJsonOrThrow(url, options) {
  try {
    const response = await fetch(url, options);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const { message } = mapErrorResponse(data);
      throw new Error(message);
    }
    return data;
  } catch (err) {
    const { message } = mapErrorResponse({ error: err.message });
    throw new Error(message);
  }
}

export async function loginUser(credentials) {
  const url = `${API_BASE}/users/login`;
  return fetchJsonOrThrow(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
