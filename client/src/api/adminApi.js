import { mapErrorResponse } from '../utils/errors';
import { withCsrf, methodNeedsCsrf, ensureCsrfToken } from '../utils/csrf';
import { reportMaintenance } from './maintenanceApi';
import { API_BASE } from '../config/api';

async function fetchJsonOrThrow(url, options = {}) {
  // Every mutating admin call must echo the CSRF token itself rather than
  // leaning on the global fetch interceptor, so the header is present even if
  // the interceptor was installed after this module captured `fetch`.
  const method = options.method;
  const headers = methodNeedsCsrf(method) ? withCsrf(options.headers) : options.headers;

  try {
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Surface maintenance to the app-wide listener before throwing, so the
      // user is moved off a page they can no longer use.
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



function authHeaders(extra = {}) {
  const token = localStorage.getItem('wim-token');
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

export async function loginAdmin(credentials) {
  // Same reason as loginUser: a fresh browser has no CSRF token in production,
  // where the cookie is on the API origin and unreadable from the app origin.
  await ensureCsrfToken();
  return fetchJsonOrThrow(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: withCsrf({ 'Content-Type': 'application/json' }),
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

export async function getAdminPeriodAnalytics() {
  return fetchJsonOrThrow(`${API_BASE}/admin/dashboard/period-analytics`, { headers: authHeaders() });
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

export async function changeAdminPassword(currentPassword, newPassword, confirmPassword) {
  return fetchJsonOrThrow(`${API_BASE}/admin/profile/password`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });
}

export async function uploadAdminProfilePicture(file) {
  const formData = new FormData();
  formData.append('photo', file);
  return fetch(`${API_BASE}/admin/profile/picture`, {
    method: 'POST',
    credentials: 'include',
    headers: withCsrf(authHeaders()),
    body: formData,
  }).then((res) => res.json().catch(() => ({})).then((data) => {
    if (!res.ok) {
      const { message } = mapErrorResponse(data);
      throw new Error(message);
    }
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

// Mails a fresh set-password link to an already-approved account. Use when the
// original approval email bounced or expired - the response carries
// `emailSent` so the UI can report a delivery failure.
export async function resendApprovalEmail(id) {
  return fetchJsonOrThrow(`${API_BASE}/admin/users/${id}/resend-approval`, {
    method: 'POST',
    headers: authHeaders(),
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
    credentials: 'include',
    headers: withCsrf(authHeaders()),
    body: formData,
  }).then((res) => res.json().catch(() => ({})).then((data) => {
    if (!res.ok) {
      const { message } = mapErrorResponse(data);
      throw new Error(message);
    }
    return data;
  }));
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

export async function deleteAccessLog(id) {
  return fetchJsonOrThrow(`${API_BASE}/admin/logs/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function deleteAccessLogs({ ids = [], dateFrom, dateTo } = {}) {
  return fetchJsonOrThrow(`${API_BASE}/admin/logs/bulk`, {
    method: 'DELETE',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ids, dateFrom, dateTo }),
  });
}

export async function deleteAllAccessLogs() {
  return fetchJsonOrThrow(`${API_BASE}/admin/logs/all`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function deleteAdminNotification(id) {
  return fetchJsonOrThrow(`${API_BASE}/admin/notifications/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function deleteAllAdminNotifications() {
  return fetchJsonOrThrow(`${API_BASE}/admin/notifications`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
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

export function getUploadTemplateUrl(type = 'teachers') {
  const token = localStorage.getItem('wim-token');
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${API_BASE}/admin/upload/template/${type}${qs}`;
}

export async function uploadTeachersExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${API_BASE}/admin/upload/teachers`, {
    method: 'POST',
    credentials: 'include',
    headers: withCsrf(authHeaders()),
    body: formData,
  }).then(res => res.json().then(data => {
    if (!res.ok) {
      const { message } = mapErrorResponse(data);
      throw new Error(message);
    }
    return data;
  }));
}

export async function uploadSupervisorsExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${API_BASE}/admin/upload/supervisors`, {
    method: 'POST',
    credentials: 'include',
    headers: withCsrf(authHeaders()),
    body: formData,
  }).then(res => res.json().then(data => {
    if (!res.ok) {
      const { message } = mapErrorResponse(data);
      throw new Error(message);
    }
    return data;
  }));
}

export async function uploadCoordinatorsExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${API_BASE}/admin/upload/coordinators`, {
    method: 'POST',
    credentials: 'include',
    headers: withCsrf(authHeaders()),
    body: formData,
  }).then(res => res.json().then(data => {
    if (!res.ok) {
      const { message } = mapErrorResponse(data);
      throw new Error(message);
    }
    return data;
  }));
}

export async function getImmersionPeriods() {
  return fetchJsonOrThrow(`${API_BASE}/admin/immersion/periods`, { headers: authHeaders() });
}

export async function createImmersionPeriod(period) {
  return fetchJsonOrThrow(`${API_BASE}/admin/immersion/periods`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(period),
  });
}

export async function updateImmersionPeriod(id, period) {
  return fetchJsonOrThrow(`${API_BASE}/admin/immersion/periods/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(period),
  });
}

export async function deleteImmersionPeriod(id) {
  return fetchJsonOrThrow(`${API_BASE}/admin/immersion/periods/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function getImmersionAccess() {
  return fetchJsonOrThrow(`${API_BASE}/admin/immersion/access`, { headers: authHeaders() });
}

export async function previewPeriodArchive(periodId) {
  return fetchJsonOrThrow(`${API_BASE}/admin/immersion/periods/${periodId}/archive-preview`, { headers: authHeaders() });
}

export async function archiveImmersionPeriod(periodId) {
  return fetchJsonOrThrow(`${API_BASE}/admin/immersion/periods/${periodId}/archive`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function listArchivePeriods() {
  return fetchJsonOrThrow(`${API_BASE}/admin/archives`, { headers: authHeaders() });
}

export async function getArchivePeriod(archiveId) {
  return fetchJsonOrThrow(`${API_BASE}/admin/archives/${archiveId}`, { headers: authHeaders() });
}
