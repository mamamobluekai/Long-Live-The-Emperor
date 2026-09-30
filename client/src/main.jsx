import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import './styles/feedback.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { ToastProvider } from './components/admin/ToastContainer';
import { ServerErrorProvider } from './components/common/ServerErrorModal';
import { NotificationProvider } from './context/NotificationContext.jsx';
import { MaintenanceProvider } from './context/MaintenanceContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AdminAuthProvider>
        <ToastProvider>
          <ServerErrorProvider>
            <NotificationProvider>
              {/* Above App so the login routes and guards can both read the flag. */}
              <MaintenanceProvider>
                <App />
              </MaintenanceProvider>
            </NotificationProvider>
          </ServerErrorProvider>
        </ToastProvider>
      </AdminAuthProvider>
    </AuthProvider>
  </StrictMode>,
);
