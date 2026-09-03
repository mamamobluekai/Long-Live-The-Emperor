const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

function getToken() {
  return localStorage.getItem('wim-token') || '';
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/files${path}`, {
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

export async function uploadMyFile(file) {
  const token = getToken();
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE}/files/upload`, {
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

export async function getMyFiles() {
  return apiFetch('/my-files');
}

export async function getAllFiles() {
  return apiFetch('/all');
}

export async function getFileById(id) {
  return apiFetch(`/${id}`);
}

export async function deleteMyFile(id) {
  return apiFetch(`/${id}`, { method: 'DELETE' });
}

export async function submitDailyDoc(payload) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/documentation/daily/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Submit failed.');
  return data;
}

export async function updateDailyDoc(payload) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/documentation/daily/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Update failed.');
  return data;
}

export async function getMyDailyDocs(params = {}) {
  const token = getToken();
  const qs = new URLSearchParams();
  if (params.date) qs.set('date', params.date);
  if (params.batchId) qs.set('batchId', params.batchId);
  const res = await fetch(`${API_BASE}/documentation/daily?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed.');
  return data;
}

export function fileDownloadUrl(url) {
  if (!url) return '';
  return url;
}
