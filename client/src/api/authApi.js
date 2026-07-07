const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

async function fetchJsonOrThrow(url, options) {
  try {
    const response = await fetch(url, options);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Request failed.');
    }
    return data;
  } catch (err) {
    // fetch() throws TypeError on network/CORS/connection errors (often displayed as "Failed to fetch")
    const msg = err?.message ? err.message : String(err);
    throw new Error(`Network/CORS error calling ${url}: ${msg}`, { cause: err });
  }
}

export async function loginUser(credentials) {
  const url = `${API_BASE}/users/login`;
  return fetchJsonOrThrow(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(credentials),
  });
}

export async function registerUser(payload) {
  const url = `${API_BASE}/users/register`;
  return fetchJsonOrThrow(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
}
