const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

function getToken() {
  return localStorage.getItem('wim-token') || '';
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/coordinator${path}`, {
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

function jsonBody(body) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/* ---------------- Student approvals ---------------- */
export async function getPendingStudents() {
  return apiFetch('/students/pending');
}

export async function approveStudent(id) {
  return apiFetch(`/students/${id}/approve`, { method: 'PUT' });
}

export async function disapproveStudent(id) {
  return apiFetch(`/students/${id}/disapprove`, { method: 'PUT' });
}

export async function uploadStudentsExcel(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/coordinator/students/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Upload failed.');
  }
  return data;
}

/* ---------------- Requirements / submissions ---------------- */
export async function listSubmissions({ status = 'all', search = '' } = {}) {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.set('status', status);
  if (search) params.set('search', search);
  const qs = params.toString();
  return apiFetch(`/submissions${qs ? `?${qs}` : ''}`);
}

export async function reviewSubmission(id, { status, remarks }) {
  return apiFetch(`/submissions/${id}/review`, jsonBody({ status, remarks }));
}

export async function getRequirements(studentId) {
  return apiFetch(`/requirements/${studentId}`);
}

export async function verifyDocument(id, { status, remarks }) {
  return apiFetch(`/documents/${id}/verify`, jsonBody({ status, remarks }));
}

/* ---------------- Teachers / Supervisors ---------------- */
export async function getTeachers(status) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch(`/teachers${qs}`);
}

export async function getSupervisors(status) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch(`/supervisors${qs}`);
}

/* ---------------- Teacher batches ---------------- */
export async function getBatches() {
  return apiFetch('/batches/assigned');
}

export async function getCompletedStudents() {
  return apiFetch('/students/completed');
}

export async function createTeacherBatch({ teacher_id, batch_label, max_students }) {
  return apiFetch('/teacher-batches', jsonBody({ teacher_id, batch_label, max_students }));
}

export async function updateTeacherBatch(batchId, { batch_label, max_students }) {
  return apiFetch(`/teacher-batches/${batchId}`, { method: 'PUT', ...jsonBody({ batch_label, max_students }) });
}

export async function deleteTeacherBatch(batchId) {
  return apiFetch(`/teacher-batches/${batchId}`, { method: 'DELETE' });
}

export async function assignStudentsToBatch(batchId, student_ids) {
  return apiFetch(`/teacher-batches/${batchId}/assign`, jsonBody({ student_ids }));
}

export async function getBatchStudents(batchId) {
  return apiFetch(`/teacher-batches/${batchId}/students`);
}

/* ---------------- Deployment requests ---------------- */
export async function getCoordinators() {
  return apiFetch('/coordinators');
}

export async function getSupervisorDeploymentRequests() {
  return apiFetch('/deployment-requests/supervisor');
}

export async function createSupervisorRequest({ coordinator_id, batch_label, strand, num_students, notes }) {
  return apiFetch('/supervisor-requests', jsonBody({ coordinator_id, batch_label, strand, num_students, notes }));
}

export async function getMyDeploymentRequests() {
  return apiFetch('/deployment-requests/me');
}

export async function createDeploymentRequest({ supervisor_id, batch_label, strand, notes, student_ids }) {
  return apiFetch('/deployment-requests', jsonBody({ supervisor_id, batch_label, strand, notes, student_ids }));
}

export async function deleteDeploymentRequest(requestId) {
  return apiFetch(`/deployment-requests/${requestId}`, { method: 'DELETE' });
}

export async function getDeploymentRequestStudents(requestId) {
  return apiFetch(`/deployment-requests/${requestId}/students`);
}

export async function fulfillSupervisorRequest(requestId, student_ids) {
  return apiFetch(`/deployment-requests/${requestId}/fulfill`, jsonBody({ student_ids }));
}
