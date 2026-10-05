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

import { API_BASE } from '../config/api';

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

// Drops the cached copy so the next read cannot return the stale value. The
// cookie itself is left alone - the browser owns it and the server is the
// authority on its current contents.
export function dropCsrfToken() {
  try {
    localStorage.removeItem('wim-csrf');
  } catch {
    // Private-mode storage failures must not break the request.
  }
  inFlightRequest = null;
}

// A client on a different site from the API (production: vercel.app -> 
// onrender.com) cannot read the `csrfToken` cookie, and a previous login is the
// only other thing that fills localStorage. On a fresh browser that leaves no
// token at all, so the very first POST - login - was rejected with 403. Fetch it
// from the API once and cache it.
let inFlightRequest = null;

// `force` re-reads the value even when one is already cached. Needed for the
// 403 recovery path in the interceptor: a cached token that was rejected is
// worse than no token at all, and a plain cache hit would keep sending it.
export async function ensureCsrfToken({ force = false } = {}) {
  if (!force && getCsrfToken()) return getCsrfToken();

  if (!inFlightRequest) {
    inFlightRequest = fetch(`${API_BASE}/users/csrf-token`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (data?.csrfToken) {
          localStorage.setItem('wim-csrf', data.csrfToken);
          return data.csrfToken;
        }
        return '';
      })
      .catch(() => '')
      .finally(() => {
        inFlightRequest = null;
      });
  }

  return inFlightRequest;
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

  const patchedFetch = async (input, init = {}) => {
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    if (!methodNeedsCsrf(method)) return originalFetch(input, init);

    // Build the header set from whatever the caller supplied plus the token.
    const send = (token) => {
      // `Headers` normalises casing and merges any Headers/init headers object.
      const headers = new Headers(init.headers ?? input?.headers ?? undefined);
      if (token && !headers.has(CSRF_HEADER)) headers.set(CSRF_HEADER, token);
      return originalFetch(input, { ...init, headers });
    };

    // No token yet - on a fresh browser that happens before the user has ever
    // logged in. Sending the mutation now would omit X-CSRF-Token and come back
    // 403, so fetch one first rather than letting the request fail. This is what
    // previously broke /users/forgot-password, /users/register and
    // /users/reset-password, since only the login helpers warmed the token.
    const token = getCsrfToken() || (await ensureCsrfToken());

    const response = await send(token);

    // A CSRF 403 is recoverable, unlike a 401: the session is live, but the
    // token we echoed no longer matches the cookie the server compares it
    // against. The cookie is rotated on logout and re-issued whenever it is
    // absent, while our cached copy can outlive that rotation. Once the two
    // drift apart every mutating request 403s and the page is stuck, because
    // nothing ever re-read the token. So on a 403 we discard the cached copy,
    // ask the API for the cookie's current value, and replay once.
    //
    // Only safe verbs are skipped here anyway, so this cannot mask a real
    // authorisation failure. `__csrfRetried` bounds the replay so a genuinely
    // rejected request still surfaces its 403 instead of looping.
    if (response.status !== 403 || init.__csrfRetried) return response;

    dropCsrfToken();
    return send(await ensureCsrfToken({ force: true }));
  };

  patchedFetch.__csrfPatched = true;
  window.fetch = patchedFetch;
}
