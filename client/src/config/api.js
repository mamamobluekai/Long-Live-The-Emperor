// Single source of truth for backend URLs.
//
// Every api module and socket consumer imports from here instead of repeating
// `import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'`.
//
// Why this matters: the app previously had two different env var names in use
// (VITE_API_BASE_URL in most modules, VITE_API_URL in a few) while .env defined
// only one of them. The modules reading the undefined name silently fell back to
// the hardcoded localhost literal, so a deploy that changed .env still shipped a
// client pointing at localhost:5000. One name, resolved once, removes that trap.
//
// To point the app at another backend, change .env only - no code edits.
//
//   VITE_API_BASE_URL  REST base, including the /api suffix
//   VITE_SOCKET_URL    Socket.IO origin, no /api suffix

const RAW_API_BASE =
  import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const RAW_SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// Trailing slashes are stripped so callers can safely write `${API_BASE}/users`
// regardless of how the value is written in .env.
const stripTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

export const API_BASE = stripTrailingSlash(RAW_API_BASE);
export const SOCKET_URL = stripTrailingSlash(RAW_SOCKET_URL);

// Some uploads and downloads are served from the server root rather than under
// /api (e.g. an Excel export opened directly in a new tab).
export const SERVER_ROOT = API_BASE.replace(/\/api$/, '');

export default API_BASE;