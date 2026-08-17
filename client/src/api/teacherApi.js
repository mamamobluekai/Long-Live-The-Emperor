import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function getToken() {
  return localStorage.getItem('wim-token') || '';
}

/* ---------------- Teacher Batch ---------------- */

export async function getMyTeacherBatch(token) {
  const res = await axios.get(`${API_URL}/coordinator/teacher-batches/me`, {
    headers: authHeaders(token),
  });
  return res.data;
}

export async function getTeacherBatchStudents(batchId, token) {
  const res = await axios.get(`${API_URL}/coordinator/teacher-batches/${batchId}/students`, {
    headers: authHeaders(token),
  });
  return res.data;
}

/* ---------------- Attendance ---------------- */

export async function getTeacherBatchStatus(batchId, token) {
  const res = await axios.get(`${API_URL}/attendance/teacher/batch/${batchId}/status`, {
    headers: authHeaders(token),
  });
  return res.data;
}

export async function openBatchAttendance(batchId, token) {
  const res = await axios.post(`${API_URL}/attendance/teacher/batch/${batchId}/open`, {}, {
    headers: authHeaders(token),
  });
  return res.data;
}

export async function closeBatchAttendance(batchId, token) {
  const res = await axios.post(`${API_URL}/attendance/teacher/batch/${batchId}/close`, {}, {
    headers: authHeaders(token),
  });
  return res.data;
}

export async function getBatchConfig(batchId, token) {
  const res = await axios.get(`${API_URL}/attendance/teacher/batch/${batchId}/config`, {
    headers: authHeaders(token),
  });
  return res.data;
}

export async function updateBatchConfig(batchId, config, token) {
  const res = await axios.put(`${API_URL}/attendance/teacher/batch/${batchId}/config`, config, {
    headers: authHeaders(token),
  });
  return res.data;
}

export async function getBatchRecords(batchId, date, token) {
  const res = await axios.get(`${API_URL}/attendance/teacher/batch/${batchId}/records`, {
    headers: authHeaders(token),
    params: date ? { date } : {},
  });
  return res.data;
}

export async function getBatchStats(batchId, date, token) {
  const res = await axios.get(`${API_URL}/attendance/teacher/batch/${batchId}/stats`, {
    headers: authHeaders(token),
    params: date ? { date } : {},
  });
  return res.data;
}

export async function getBatchAppeals(batchId, status, token) {
  const res = await axios.get(`${API_URL}/attendance/teacher/batch/${batchId}/appeals`, {
    headers: authHeaders(token),
    params: status ? { status } : {},
  });
  return res.data;
}

export async function reviewAppeal(appealId, payload, token) {
  const res = await axios.post(`${API_URL}/attendance/teacher/appeals/${appealId}/review`, payload, {
    headers: authHeaders(token),
  });
  return res.data;
}

export async function getBatchSchedules(batchId, token) {
  const res = await axios.get(`${API_URL}/attendance/teacher/batch/${batchId}/schedules`, {
    headers: authHeaders(token),
  });
  return res.data;
}

export async function upsertBatchSchedule(batchId, payload, token) {
  const res = await axios.put(`${API_URL}/attendance/teacher/batch/${batchId}/schedules`, payload, {
    headers: authHeaders(token),
  });
  return res.data;
}

/* ---------------- Evaluations ---------------- */

export async function getTeacherBatchEvaluations() {
  const res = await axios.get(`${API_URL}/evaluation/teacher/my-batch`, {
    headers: authHeaders(getToken()),
  });
  return res.data;
}

/* ---------------- Files ---------------- */

export async function getAllFiles() {
  const res = await axios.get(`${API_URL}/files/all`, {
    headers: authHeaders(getToken()),
  });
  return res.data;
}

export async function getFileById(id) {
  const res = await axios.get(`${API_URL}/files/${id}`, {
    headers: authHeaders(getToken()),
  });
  return res.data;
}

/* ---------------- Tracking / Live Map ---------------- */

export async function getBatchCurrentLocations(batchId, token, config = {}) {
  const res = await axios.get(`${API_URL}/tracking/location/batch/${batchId}`, {
    headers: authHeaders(token),
    ...config,
  });
  return res.data;
}

export async function getStudentLocationHistory(studentId, token) {
  const res = await axios.get(`${API_URL}/tracking/location/history/${studentId}`, {
    headers: authHeaders(token),
  });
  return res.data;
}
