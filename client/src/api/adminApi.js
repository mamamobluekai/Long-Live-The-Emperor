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

export async function getAllUsers() {
  return fetchJsonOrThrow(`${API_BASE}/admin/users`);
}

export async function getCoordinators() {
  return fetchJsonOrThrow(`${API_BASE}/admin/coordinators`);
}

export async function getUsersByStatus(status) {
  return fetchJsonOrThrow(`${API_BASE}/admin/users/status/${status}`);
}

export async function approveStaff(id) {
  return fetchJsonOrThrow(`${API_BASE}/admin/staff/${id}/approve`, { method: 'PUT' });
}

export async function disapproveStaff(id) {
  return fetchJsonOrThrow(`${API_BASE}/admin/staff/${id}/disapprove`, { method: 'PUT' });
}

export async function deleteUser(id) {
  return fetchJsonOrThrow(`${API_BASE}/admin/users/${id}`, { method: 'DELETE' });
}

export async function uploadTeachersExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${API_BASE}/admin/upload/teachers`, {
    method: 'POST',
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
    body: formData,
  }).then(res => res.json().then(data => {
    if (!res.ok) throw new Error(data.error || data.message || 'Upload failed');
    return data;
  }));
}