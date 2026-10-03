// Client half of silent access-token renewal.
//
// `generateAccessToken` only issues 1-hour tokens (server/utils/generateToken.js),
// while the refresh token in the httpOnly cookie lives 7 days. The server
// exposes POST /api/users/refresh to swap them, but no call site used it, so a
// logged-in user was hard-logged-out every hour with a bare 401 that
// utils/errors.js had no rule for ("Something went wrong. Please try again.").
//
// Like the CSRF interceptor, this patches global `fetch` once at startup so it
// covers every API module and ad-hoc call site, including ones added later.

import { CSRF_HEADER, getCsrfToken } from './csrf';
import { API_BASE } from '../config/api';



// Requests that legitimately 401 on their own. Retrying these would either
// loop forever (refresh) or mask a real "wrong password" error (login).
const NO_RETRY = ['/login', '/refresh', '/register', '/forgot-password', '/reset-password'];

function shouldSkip(url) {
  const path = String(url || '');
  return NO_RETRY.some((segment) => path.includes(segment));
}

function storeToken(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Private-mode storage failures must not break the request.
  }
}

// Single in-flight refresh shared by every caller, so a dashboard firing six
// parallel requests on an expired token rotates the cookie once, not six times.
// Rotation revokes the presented token, so concurrent refreshes would
// invalidate each other.
let inFlightRefresh = null;

async function refreshAccessToken() {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const response = await fetch(`${API_BASE}/users/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: getCsrfToken() },
      });

      if (!response.ok) return null;

      const data = await response.json().catch(() => ({}));
      if (!data.accessToken) return null;

      storeToken('wim-token', data.accessToken);
      if (data.csrfToken) storeToken('wim-csrf', data.csrfToken);

      return data.accessToken;
    } catch {
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

export function installFetchAuthInterceptor() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  if (window.fetch.__authPatched) return;

  const originalFetch = window.fetch.bind(window);

  const patchedFetch = async (input, init = {}) => {
    const response = await originalFetch(input, init);

    if (response.status !== 401 || init.__authRetried || shouldSkip(input?.url || input)) {
      return response;
    }

    const token = await refreshAccessToken();
    if (!token) {
      // The session is genuinely over. Drop the dead token so the route guards
      // send the user to the login screen instead of looping on 401s.
      storeToken('wim-token', null);
      storeToken('wim-user', null);
      return response;
    }

    const headers = new Headers(init.headers ?? input?.headers ?? undefined);
    headers.set('Authorization', `Bearer ${token}`);

    return originalFetch(input, { ...init, __authRetried: true, headers });
  };

  patchedFetch.__authPatched = true;
  window.fetch = patchedFetch;
}

export { refreshAccessToken };