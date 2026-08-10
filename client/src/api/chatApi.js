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

function authHeaders(extra = {}) {
  const token = localStorage.getItem('wim-token');
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

export async function getChatBatches() {
  return fetchJsonOrThrow(`${API_BASE}/chat/batches`, { headers: authHeaders() });
}

export async function getChatMessages(batchId) {
  return fetchJsonOrThrow(`${API_BASE}/chat/batch/${batchId}/messages`, { headers: authHeaders() });
}

export async function sendChatMessage(batchId, content) {
  return fetchJsonOrThrow(`${API_BASE}/chat/batch/${batchId}/messages`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content }),
  });
}

export async function sendChatReply(batchId, content, parentMessageId) {
  return fetchJsonOrThrow(`${API_BASE}/chat/batch/${batchId}/messages`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content, parentMessageId }),
  });
}

export async function deleteChatMessage(batchId, messageId, deleteForEveryone = false) {
  return fetchJsonOrThrow(`${API_BASE}/chat/batch/${batchId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ deleteForEveryone }),
  });
}

export async function addReaction(batchId, messageId, emoji) {
  return fetchJsonOrThrow(`${API_BASE}/chat/batch/${batchId}/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ emoji }),
  });
}

export async function removeReaction(batchId, messageId, emoji) {
  return fetchJsonOrThrow(`${API_BASE}/chat/batch/${batchId}/messages/${messageId}/reactions`, {
    method: 'DELETE',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ emoji }),
  });
}
