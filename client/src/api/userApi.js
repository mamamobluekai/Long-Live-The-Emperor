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
