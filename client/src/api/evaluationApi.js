const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

function getToken() {
  return localStorage.getItem('wim-token') || '';
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
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

export async function getEvaluationCriteria() {
  return apiFetch('/evaluation/criteria');
}

export async function saveEvaluationCriteria(criteria) {
  return apiFetch('/evaluation/criteria', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ criteria }),
  });
}

export async function submitStudentEvaluation(payload) {
  return apiFetch('/evaluation/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getStudentEvaluation(studentId) {
  return apiFetch(`/evaluation/student/${studentId}`);
}

export async function getBatchEvaluations(batchId) {
  return apiFetch(`/evaluation/batch/${batchId}`);
}

export async function getSupervisorEvaluationStudents() {
  return apiFetch('/evaluation/my-students');
}

export async function getMyEvaluation() {
  return apiFetch('/evaluation/me');
}

export async function getTeacherBatchEvaluations() {
  return apiFetch('/evaluation/teacher/my-batch');
}
