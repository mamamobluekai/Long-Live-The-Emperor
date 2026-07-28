const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const FORM_BASE = API_BASE.replace(/\/api$/, '');

function getToken() {
  return localStorage.getItem('wim-token') || '';
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/student${path}`, {
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

export async function getMyRequirements() {
  return apiFetch('/requirements/me');
}

export async function updateMyRequirements(data) {
  return apiFetch('/requirements/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function submitMyRequirements() {
  return apiFetch('/requirements/me/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export async function getMySubmissionStatus() {
  return apiFetch('/requirements/me/status');
}

export async function getMyProgress() {
  return apiFetch('/progress');
}

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

export async function downloadMyCertificate() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/certificate/me/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.message || 'Certificate download failed.');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return {
    blob,
    filename: match?.[1] || 'Certificate.pdf',
  };
}

export async function uploadMyDocument(file, documentCode) {
  const token = getToken();
  const fd = new FormData();
  fd.append('file', file);
  fd.append('document_code', documentCode);
  const res = await fetch(`${API_BASE}/student/documents/me/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Upload failed.');
  }
  return data;
}

export async function deleteMyDocument(docId) {
  return apiFetch(`/documents/me/${docId}`, { method: 'DELETE' });
}

export function documentFileUrl(filePath) {
  if (!filePath) return '';
  return `${FORM_BASE}/${filePath}`;
}
