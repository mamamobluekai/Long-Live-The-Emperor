const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

function authHeaders(extra = {}) {
  const token = localStorage.getItem('wim-token');
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
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
