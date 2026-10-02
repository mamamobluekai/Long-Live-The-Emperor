import axios from 'axios';
import { getCsrfToken, methodNeedsCsrf, CSRF_HEADER } from '../utils/csrf';

// Axios does not go through `window.fetch`, so it needs the CSRF header wired
// up separately. Registering on the shared default instance applies to every
// module, including the ones that import `axios` directly.
axios.defaults.withCredentials = true;

axios.interceptors.request.use((config) => {
  if (!methodNeedsCsrf(config.method)) return config;

  const token = getCsrfToken();
  if (!token) return config;

  // Axios 1.x uses an AxiosHeaders instance, older shapes use a plain object.
  if (typeof config.headers?.set === 'function') {
    if (!config.headers.has(CSRF_HEADER)) config.headers.set(CSRF_HEADER, token);
  } else {
    config.headers = config.headers || {};
    if (!config.headers[CSRF_HEADER]) config.headers[CSRF_HEADER] = token;
  }

  return config;
});

export default axios;
