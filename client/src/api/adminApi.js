async function fetchJsonOrThrow(url, options) {
  try {
    const response = await fetch(url, options);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Request failed.');
    }
    return data;
  } catch (err) {
    const msg = err?.message ? err.message : String(err);
    throw new Error(`Network/CORS error calling ${url}: ${msg}`, { cause: err });
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

function authHeaders(extra = {}) {
  const token = localStorage.getItem('wim-token');
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

export async function loginAdmin(credentials) {
  return fetchJsonOrThrow(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(credentials),
  });
}

export async function logoutAdmin() {
  return fetchJsonOrThrow(`${API_BASE}/admin/logout`, {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
  });
}

export async function getAllUsers(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return fetchJsonOrThrow(`${API_BASE}/admin/users${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
}

export async function getCoordinators() {
  return fetchJsonOrThrow(`${API_BASE}/admin/coordinators`, { headers: authHeaders() });
}

export async function getUsersByStatus(status) {
  return fetchJsonOrThrow(`${API_BASE}/admin/users/status/${status}`, { headers: authHeaders() });
}

export async function createAdmin(admin) {
  return fetchJsonOrThrow(`${API_BASE}/admin/admins`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(admin),
  });
}

export async function getAdminDashboard() {
  return fetchJsonOrThrow(`${API_BASE}/admin/dashboard`, { headers: authHeaders() });
}

export async function getAdminProfile() {
  return fetchJsonOrThrow(`${API_BASE}/admin/profile`, { headers: authHeaders() });
}

export async function updateAdminProfile(profile) {
  return fetchJsonOrThrow(`${API_BASE}/admin/profile`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(profile),
  });
}

export async function changeAdminPassword(currentPassword, newPassword) {
  return fetchJsonOrThrow(`${API_BASE}/admin/profile/password`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function uploadAdminProfilePicture(file) {
  const formData = new FormData();
  formData.append('photo', file);
  return fetch(`${API_BASE}/admin/profile/picture`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  }).then((res) => res.json().then((data) => {
    if (!res.ok) throw new Error(data.error || data.message || 'Upload failed');
    return data;
  }));
}

export async function getUserProfile(id) {
  return fetchJsonOrThrow(`${API_BASE}/admin/users/${id}`, { headers: authHeaders() });
}

export async function updateUser(id, payload) {
  return fetchJsonOrThrow(`${API_BASE}/admin/users/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export async function updateUserStatus(id, status) {
  return fetchJsonOrThrow(`${API_BASE}/admin/users/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status }),
  });
}

export async function resetUserPassword(id, password) {
  return fetchJsonOrThrow(`${API_BASE}/admin/users/${id}/reset-password`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ password }),
  });
}

export async function getPendingCoordinators() {
  return fetchJsonOrThrow(`${API_BASE}/admin/coordinators/pending`, { headers: authHeaders() });
}

export async function approveCoordinator(id) {
  return fetchJsonOrThrow(`${API_BASE}/admin/coordinators/${id}/approve`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
}

export async function rejectCoordinator(id) {
  return fetchJsonOrThrow(`${API_BASE}/admin/coordinators/${id}/reject`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
}

export async function getAdminSettings() {
  return fetchJsonOrThrow(`${API_BASE}/admin/settings`, { headers: authHeaders() });
}

export async function updateAdminSettings(settings) {
  return fetchJsonOrThrow(`${API_BASE}/admin/settings`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(settings),
  });
}

export async function uploadLogo(file) {
  const formData = new FormData();
  formData.append('logo', file);
  return fetch(`${API_BASE}/admin/settings/logo`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  }).then((res) => res.json().then((data) => {
    if (!res.ok) throw new Error(data.error || data.message || 'Logo upload failed');
    return data;
  }));
}

export async function getAdminLogs(query = '') {
  return fetchJsonOrThrow(`${API_BASE}/admin/logs${query ? `?${query}` : ''}`, { headers: authHeaders() });
}

export async function getAccessLogs(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return fetchJsonOrThrow(`${API_BASE}/admin/logs${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
}

export function getAccessLogsExportUrl(format = 'csv', params = {}) {
  const token = localStorage.getItem('wim-token');
  const qs = new URLSearchParams({ ...params, format });
  if (token) qs.set('token', token);
  return `${API_BASE}/admin/logs?${qs.toString()}`;
}

export async function getAdminNotifications() {
  return fetchJsonOrThrow(`${API_BASE}/admin/notifications`, { headers: authHeaders() });
}

export async function markNotificationsRead() {
  return fetchJsonOrThrow(`${API_BASE}/admin/notifications/read`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  });
}

export function getReportUrl(type, format = 'json') {
  const token = localStorage.getItem('wim-token');
  const params = new URLSearchParams({ format });
  if (token) params.set('token', token);
  return `${API_BASE}/admin/reports/${type}?${params.toString()}`;
}

export async function getAdminReport(type, format = 'json') {
  return fetchJsonOrThrow(getReportUrl(type, format), { headers: authHeaders() });
}

export async function approveStaff(id) {
  return fetchJsonOrThrow(`${API_BASE}/admin/staff/${id}/approve`, { method: 'PUT', headers: authHeaders() });
}

export async function disapproveStaff(id) {
  return fetchJsonOrThrow(`${API_BASE}/admin/staff/${id}/disapprove`, { method: 'PUT', headers: authHeaders() });
}

export async function deleteUser(id) {
  return fetchJsonOrThrow(`${API_BASE}/admin/users/${id}`, { method: 'DELETE', headers: authHeaders() });
}

export async function uploadTeachersExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${API_BASE}/admin/upload/teachers`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  }).then(res => res.json().then(data => {
    if (!res.ok) throw new Error(data.error || data.message || 'Upload failed');
    return data;
  }));
}

export async function uploadSupervisorsExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${API_BASE}/admin/upload/supervisors`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  }).then(res => res.json().then(data => {
    if (!res.ok) throw new Error(data.error || data.message || 'Upload failed');
    return data;
  }));
}

export async function uploadCoordinatorsExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${API_BASE}/admin/upload/coordinators`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  }).then(res => res.json().then(data => {
    if (!res.ok) throw new Error(data.error || data.message || 'Upload failed');
    return data;
  }));
}
