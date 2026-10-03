import { API_BASE } from '../config/api';


function authHeaders(extra = {}) {
  const token = localStorage.getItem('wim-token');
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function request(path, options = {}) {
  // credentials:'include' matches every other module. Without it the csrfToken
  // cookie is not sent on these mutating calls, so csrfProtection skips
  // verification for them.
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: authHeaders(options.headers || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || 'Notification request failed.');
  return data;
}

export function getNotifications(limit = 50) {
  return request(`/notifications?limit=${encodeURIComponent(limit)}`);
}

export function markNotificationRead(id) {
  return request(`/notifications/${id}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead() {
  return request('/notifications/read-all', { method: 'PATCH' });
}

export function deleteAllNotifications() {
  return request('/notifications', { method: 'DELETE' });
}
