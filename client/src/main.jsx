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
import { installFetchCsrfInterceptor } from './utils/csrf';
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AdminAuthProvider>
        <ToastProvider>
          <NotificationProvider>
            {/* Above App so the login routes and guards can both read the flag. */}
            <MaintenanceProvider>
              <App />
            </MaintenanceProvider>
          </NotificationProvider>
        </ToastProvider>
      </AdminAuthProvider>
    </AuthProvider>
  </StrictMode>,
);
