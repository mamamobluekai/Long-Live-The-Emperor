import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import './styles/feedback.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { ToastProvider } from './components/admin/ToastContainer';
import { NotificationProvider } from './context/NotificationContext.jsx';
import { MaintenanceProvider } from './context/MaintenanceContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { installFetchCsrfInterceptor, ensureCsrfToken } from './utils/csrf';
import { installFetchAuthInterceptor } from './utils/authRefresh';
// Imported for its side effect: registers the axios CSRF interceptor on the
// shared instance (see api/axiosClient.js).
import './api/axiosClient';

// Must run before the tree mounts, otherwise the first requests (maintenance
// probe, then login) go out without the CSRF header and get a 403.
// Auth refresh installs after CSRF so a retried request passes back through the
// CSRF layer and keeps its token header.
installFetchCsrfInterceptor();
installFetchAuthInterceptor();

// Warm the token at startup rather than waiting for the first mutating request.
// In production the csrfToken cookie lives on the API origin and cannot be read
// by script on the app origin, so nothing else would fill localStorage before the
// user clicks login, forgot-password or register. Fire-and-forget: the
// interceptor also fetches on demand, so a failure here is not fatal.
ensureCsrfToken();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AdminAuthProvider>
        <ToastProvider>
          <NotificationProvider>
            {/* Above App so the login routes and guards can both read the flag. */}
            <MaintenanceProvider>
              {/* Outermost-ish so every route (login included) renders with the
                  stored light/dark preference already applied to <html>. */}
              <ThemeProvider>
                <App />
              </ThemeProvider>
            </MaintenanceProvider>
          </NotificationProvider>
        </ToastProvider>
      </AdminAuthProvider>
    </AuthProvider>
  </StrictMode>,
);
