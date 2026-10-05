import { withCsrf, methodNeedsCsrf } from '../utils/csrf';
import { API_BASE } from '../config/api';



function getToken() {
  return localStorage.getItem('wim-token') || '';
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  let headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Echo the CSRF token on state-changing verbs so the server can verify the
  // request originated from our page (#6 CSRF).
  if (methodNeedsCsrf(options.method)) headers = withCsrf(headers);
  const res = await fetch(`${API_BASE}/users${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Request failed.');
  }
  return data;
}

export async function getUserProfile() {
  return apiFetch('/profile');
}

// Revokes the refresh cookie and the access token server-side. Without this the
// token only disappears from localStorage, leaving a usable session alive until
// it expires on its own.
export async function logoutUser() {
  return apiFetch('/logout', { method: 'POST' });
}

// Records the user's one-time acceptance of the Terms and Agreement.
export async function acceptTermsAgreement() {
  return apiFetch('/terms/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function updateUserProfile(profile) {
  return apiFetch('/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
}

export async function changeUserPassword(currentPassword, newPassword, confirmPassword) {
  return apiFetch('/profile/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });
}

export async function uploadUserProfilePicture(file) {
  const formData = new FormData();
  formData.append('photo', file);
  const token = getToken();
  const res = await fetch(`${API_BASE}/users/profile/picture`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Upload failed');
  }
  return data;
}
