import axios from 'axios';
import { io } from 'socket.io-client';
import { API_BASE, SOCKET_URL } from '../config/api';

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

// ---------- Student ----------
export async function getStudentAttendanceAccess(token) {
  const res = await axios.get(`${API_BASE}/attendance/student/status`, { headers: authHeaders(token) });
  return res.data;
}

export async function getStudentAttendanceStatus(token) {
  const res = await axios.get(`${API_BASE}/attendance/student/status`, { headers: authHeaders(token) });
  return res.data;
}

export async function studentCheckIn(lat, lng, accuracy, token) {
  const res = await axios.post(
    `${API_BASE}/attendance/check-in`,
    { latitude: lat, longitude: lng, accuracy },
    { headers: authHeaders(token) }
  );
  return res.data;
}

export async function studentCheckOut(lat, lng, accuracy, token) {
  const res = await axios.post(
    `${API_BASE}/attendance/check-out`,
    { latitude: lat, longitude: lng, accuracy },
    { headers: authHeaders(token) }
  );
  return res.data;
}

export async function submitAppeal(formData, token) {
  const res = await axios.post(`${API_BASE}/attendance/appeal`, formData, {
    headers: { ...authHeaders(token), 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function getMyAppeals(token) {
  const res = await axios.get(`${API_BASE}/attendance/appeals/me`, { headers: authHeaders(token) });
  return res.data;
}

export async function deleteMyAppeal(appealId, token) {
  const res = await axios.delete(`${API_BASE}/attendance/appeals/${appealId}`, { headers: authHeaders(token) });
  return res.data;
}

// ---------- Teacher ----------
export async function getTeacherBatchStatus(batchId, token) {
  const res = await axios.get(`${API_BASE}/attendance/teacher/batch/${batchId}/status`, { headers: authHeaders(token) });
  return res.data;
}

export async function openBatchAttendance(batchId, token) {
  const res = await axios.post(`${API_BASE}/attendance/teacher/batch/${batchId}/open`, {}, { headers: authHeaders(token) });
  return res.data;
}

export async function closeBatchAttendance(batchId, token) {
  const res = await axios.post(`${API_BASE}/attendance/teacher/batch/${batchId}/close`, {}, { headers: authHeaders(token) });
  return res.data;
}

export async function getBatchConfig(batchId, token) {
  const res = await axios.get(`${API_BASE}/attendance/teacher/batch/${batchId}/config`, { headers: authHeaders(token) });
  return res.data;
}

export async function updateBatchConfig(batchId, config, token) {
  const res = await axios.put(`${API_BASE}/attendance/teacher/batch/${batchId}/config`, config, { headers: authHeaders(token) });
  return res.data;
}

export async function getBatchRecords(batchId, date, token) {
  const res = await axios.get(`${API_BASE}/attendance/teacher/batch/${batchId}/records`, {
    headers: authHeaders(token),
    params: date ? { date } : {},
  });
  return res.data;
}

export async function getBatchStats(batchId, date, token) {
  const res = await axios.get(`${API_BASE}/attendance/teacher/batch/${batchId}/stats`, {
    headers: authHeaders(token),
    params: date ? { date } : {},
  });
  return res.data;
}

export async function getBatchAppeals(batchId, status, token) {
  const res = await axios.get(`${API_BASE}/attendance/teacher/batch/${batchId}/appeals`, {
    headers: authHeaders(token),
    params: status ? { status } : {},
  });
  return res.data;
}

export async function reviewAppeal(appealId, payload, token) {
  const res = await axios.post(`${API_BASE}/attendance/teacher/appeals/${appealId}/review`, payload, { headers: authHeaders(token) });
  return res.data;
}

export async function getBatchSchedules(batchId, token) {
  const res = await axios.get(`${API_BASE}/attendance/teacher/batch/${batchId}/schedules`, { headers: authHeaders(token) });
  return res.data;
}

export async function upsertBatchSchedule(batchId, payload, token) {
  const res = await axios.put(`${API_BASE}/attendance/teacher/batch/${batchId}/schedules`, payload, { headers: authHeaders(token) });
  return res.data;
}

export async function getMySchedule(token) {
  const res = await axios.get(`${API_BASE}/attendance/student/schedule`, { headers: authHeaders(token) });
  return res.data;
}

export async function getMyAttendanceRecords(token) {
  const res = await axios.get(`${API_BASE}/attendance/student/records`, { headers: authHeaders(token) });
  return res.data;
}

export async function updateStudentLocation(lat, lng, accuracy, token) {
  const res = await axios.post(
    `${API_BASE}/tracking/location/update`,
    { latitude: lat, longitude: lng, accuracy },
    { headers: authHeaders(token) }
  );
  return res.data;
}

export async function getStudentLocationHistory(studentId, token) {
  const res = await axios.get(`${API_BASE}/tracking/location/history/${studentId}`, { headers: authHeaders(token) });
  return res.data;
}

// ---------- Socket ----------
export function connectAttendanceSocket(token) {
  return io(SOCKET_URL, { auth: { token } });
}
