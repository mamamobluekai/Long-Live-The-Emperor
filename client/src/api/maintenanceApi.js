import { mapErrorResponse, MAINTENANCE_FALLBACK_MESSAGE } from '../utils/errors';
import { API_BASE } from '../config/api';



// Fired whenever any API call comes back 503/maintenance, so the app can swap in
// the maintenance screen immediately instead of waiting for the next poll.
export const MAINTENANCE_EVENT = 'wim:maintenance';

let cached = { enabled: false, message: MAINTENANCE_FALLBACK_MESSAGE, startedAt: null, estimatedEnd: null };
const listeners = new Set();

const normalize = (raw) => ({
  enabled: Boolean(raw?.enabled),
  message: raw?.message || MAINTENANCE_FALLBACK_MESSAGE,
  startedAt: raw?.startedAt || null,
  estimatedEnd: raw?.estimatedEnd || null,
});

// Lets API wrappers report a maintenance response without importing React.
export function reportMaintenance(status) {
  const next = normalize(status);
  cached = next;
  listeners.forEach((fn) => fn(next));
  window.dispatchEvent(new CustomEvent(MAINTENANCE_EVENT, { detail: next }));
}

export function subscribeMaintenance(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCachedMaintenance() {
  return cached;
}

/**
 * Public status read. Never rejects, so a failure while maintenance is on can
 * never produce a second, confusing error state on top of the banner.
 */
export async function fetchMaintenanceStatus() {
  try {
    const res = await fetch(`${API_BASE}/maintenance/status`);
    if (!res.ok) return cached;
    const data = await res.json().catch(() => ({}));
    const next = normalize(data.maintenance);
    cached = next;
    return next;
  } catch {
    return cached;
  }
}

export async function setMaintenanceMode({ enabled, message, estimatedEnd }) {
  const token = localStorage.getItem('wim-token');
  const res = await fetch(`${API_BASE}/admin/settings/maintenance`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ enabled, message, estimatedEnd }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { message: friendly } = mapErrorResponse(data);
    throw new Error(friendly);
  }
  const next = normalize(data.maintenance);
  cached = next;
  return next;
}
