// Client half of the double-submit CSRF protection (#6).
//
// The server sets a readable `csrfToken` cookie. Because JavaScript on our own
// origin can read it but a cross-site attacker cannot, echoing the value in the
// `X-CSRF-Token` header proves the request came from our page. The server
// compares the header against the cookie on every state-changing request.
//
// Usage in an API helper:
//   import { withCsrf } from '../utils/csrf';
//   fetch(url, { method: 'POST', credentials: 'include', headers: withCsrf({ 'Content-Type': 'application/json' }) })

export const CSRF_COOKIE = 'csrfToken';
export const CSRF_HEADER = 'X-CSRF-Token';

// Read a single cookie by name. Returns '' when absent (e.g. before first load).
function readCookie(name) {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

// The server issues the token twice: as the `csrfToken` cookie AND in the login
// response body (which AuthContext keeps in `localStorage['wim-csrf']`). The
// cookie is only readable by JS when the app and the API share an origin. When
// they do not - client on a LAN address, API on localhost, or any split-host
// dev setup - `document.cookie` comes back empty while the browser still sends
// the cookie on credentialed requests, so the server sees a cookie with no
// matching header and returns 403. Falling back to the stored copy keeps the
// double-submit match working in both layouts.
export function getCsrfToken() {
  return readCookie(CSRF_COOKIE) || localStorage.getItem('wim-csrf') || '';
}

// Merge the CSRF header into an existing headers object.
export function withCsrf(headers = {}) {
  const token = getCsrfToken();
  return token ? { ...headers, [CSRF_HEADER]: token } : headers;
}

// Only state-changing verbs require the token.
export function methodNeedsCsrf(method) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase());
}

// The server only enforces the double-submit check when the cookie actually
// arrives, which every call does because it uses `credentials: 'include'`.
// So a missing header is a guaranteed 403 on login. Rather than repeat
// `withCsrf(...)` in all ~16 api modules (and every ad-hoc fetch in a page),
// install one interceptor over the global `fetch`. It covers every call site,
// including ones added later.
export function installFetchCsrfInterceptor() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  if (window.fetch.__csrfPatched) return;

  const originalFetch = window.fetch.bind(window);

  const patchedFetch = (input, init = {}) => {
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    if (!methodNeedsCsrf(method)) return originalFetch(input, init);

    const token = getCsrfToken();
    if (!token) return originalFetch(input, init);

    // `Headers` normalises casing and merges any Headers/init headers object.
    const headers = new Headers(init.headers ?? input?.headers ?? undefined);
    if (!headers.has(CSRF_HEADER)) headers.set(CSRF_HEADER, token);

    return originalFetch(input, { ...init, headers });
  };

  patchedFetch.__csrfPatched = true;
  window.fetch = patchedFetch;
}
