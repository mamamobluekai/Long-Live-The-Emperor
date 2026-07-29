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

// Supervisor
export async function supervisorGetEligibleStudents() {
  return apiFetch('/supervisor/certificate/eligible');
}

export async function supervisorGetAllStudents() {
  return apiFetch('/supervisor/certificate/eligible?all=true');
}

export async function supervisorGenerateCertificate(studentId) {
  return apiFetch(`/supervisor/certificate/generate/${studentId}`, { method: 'POST' });
}

export async function supervisorForceGenerateCertificate(studentId) {
  return apiFetch(`/supervisor/certificate/force/${studentId}`, { method: 'POST' });
}

export async function supervisorUndoForceIssue(studentId) {
  return apiFetch(`/supervisor/certificate/undo/${studentId}`, { method: 'DELETE' });
}

export async function supervisorGetCertificateTemplate() {
  return apiFetch('/supervisor/certificate/template/me');
}

export async function supervisorSaveCertificateTemplate(data) {
  return apiFetch('/supervisor/certificate/template/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// Student
export async function getMyCertificate() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/certificate/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Request failed.');
  }
  return data;
}
