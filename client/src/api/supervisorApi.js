import { API_BASE } from '../config/api';


function getToken() {
  return localStorage.getItem('wim-token') || '';
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/supervisor${path}`, {
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

export async function getSupervisorDashboard() {
  return apiFetch('/dashboard');
}

// The supervisor's deployment "batches" and the students in each.
export async function getSupervisorBatches() {
  return apiFetch('/batches');
}

// Attendance of one batch's students, grouped by immersion day.
export async function getSupervisorBatchAttendance(requestId, { from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return apiFetch(`/batches/${requestId}/attendance${qs ? `?${qs}` : ''}`);
}

// Per-student progress: requirements completion, attendance per immersion day,
// and daily documentation per immersion day. Scoped to the supervisor server-side.
export async function getSupervisorStudentProgress(studentId) {
  return apiFetch(`/students/${studentId}/progress`);
}

export async function createSupervisorReportConcern(payload) {
  return apiFetch('/reports-concerns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getSupervisorReportsConcerns() {
  return apiFetch('/reports-concerns');
}

// Withdraw a report the supervisor filed.
export async function deleteSupervisorReportConcern(reportId) {
  return apiFetch(`/reports-concerns/${reportId}`, { method: 'DELETE' });
}

// ----- Blocked immersion dates & Philippine holidays -----
// A blocked date is skipped when counting immersion days, even on a Mon-Fri.
// Philippine holidays are skipped automatically on every schedule read.

export async function getSupervisorBlockedDates(batchId, supervisorId) {
  const qs = supervisorId != null ? `?supervisor_id=${encodeURIComponent(supervisorId)}` : '';
  return apiFetch(`/batches/${batchId}/blocked-dates${qs}`);
}

export async function addSupervisorBlockedDate(batchId, payload) {
  return apiFetch(`/batches/${batchId}/blocked-dates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function removeSupervisorBlockedDate(blockedId) {
  return apiFetch(`/blocked-dates/${blockedId}`, { method: 'DELETE' });
}

export async function getSupervisorHolidays() {
  return apiFetch('/holidays');
}

export async function addSupervisorHoliday(payload) {
  return apiFetch('/holidays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function removeSupervisorHoliday(id) {
  return apiFetch(`/holidays/${id}`, { method: 'DELETE' });
}

// ----- Attendance scheduling & records (shared batch endpoints) -----
// The supervisor owns attendance scheduling for the teacher batches linked
// to them. These hit the shared /attendance/teacher/batch/:id endpoints,
// which now authorize teacher, supervisor, and coordinator.

async function attendanceFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/attendance${path}`, {
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

function jsonBody(payload) {
  return {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

export async function getSupervisorBatchStatus(batchId) {
  return attendanceFetch(`/teacher/batch/${batchId}/status`);
}

export async function getSupervisorBatchConfig(batchId) {
  return attendanceFetch(`/teacher/batch/${batchId}/config`);
}

export async function updateSupervisorBatchConfig(batchId, config) {
  return attendanceFetch(`/teacher/batch/${batchId}/config`, jsonBody(config));
}

export async function openSupervisorBatchAttendance(batchId) {
  return attendanceFetch(`/teacher/batch/${batchId}/open`, { method: 'POST' });
}

export async function closeSupervisorBatchAttendance(batchId) {
  return attendanceFetch(`/teacher/batch/${batchId}/close`, { method: 'POST' });
}

// Decide a student's time in / time out attendance appeal. Approving marks the
// appealed event as present; rejecting leaves the record untouched.
export async function reviewSupervisorAttendanceAppeal(appealId, { status, comment } = {}) {
  return attendanceFetch(`/teacher/appeals/${appealId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, comment: comment || null }),
  });
}

export async function getSupervisorBatchSchedules(batchId) {
  return attendanceFetch(`/teacher/batch/${batchId}/schedules`);
}

export async function upsertSupervisorBatchSchedule(batchId, payload) {
  return attendanceFetch(`/teacher/batch/${batchId}/schedules`, jsonBody(payload));
}

export async function getSupervisorBatchRecords(batchId, date) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return attendanceFetch(`/teacher/batch/${batchId}/records${qs}`);
}

export async function getSupervisorBatchReport(batchId) {
  return attendanceFetch(`/teacher/batch/${batchId}/report`);
}

export async function getSupervisorBatchStats(batchId, date) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return attendanceFetch(`/teacher/batch/${batchId}/stats${qs}`);
}
