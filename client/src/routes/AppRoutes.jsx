import { Navigate, Route, Routes } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminAuth } from '../context/useAdminAuth';
import { useMaintenance } from '../context/maintenanceContextValue';
import { useToast } from '../components/admin/toastContext';
import MaintenanceScreen from '../components/common/MaintenanceScreen';
import TermsAgreementGate from '../components/auth/TermsAgreementGate';
import { acceptTermsAgreement } from '../api/userApi';
import LoginAndFRegister from '../pages/LoginAndRegister/LoginAndFRegister';
import AdminLogin from '../pages/admin/AdminLogin';
import AdminDashboard from '../pages/dashboards/adminDashboard/AdminDashboard';
import CoordinatorDashboard from '../pages/dashboards/coordinatorDashboard/CoordinatorDashboard';
import TeacherDashboard from '../pages/dashboards/teacherDashboard/TeacherDashboard';
import StudentDashboard from '../pages/dashboards/studentDashboard/studentDashboard';
import SupervisorDashboard from '../pages/dashboards/supervisorDashboard/SupervisorDashboard';
import SetPassword from '../pages/SetPassword/SetPassword';
import ForgotPassword from '../pages/ForgotPassword/ForgotPassword';

// One-time Terms and Agreement, shown after every sign-in until the user agrees.
//
// The flag arrives on the login payload (and in the persisted `wim-user`), so no
// extra request is needed to decide whether to render the prompt. Agreeing
// persists it server-side and mirrors it into the stored user, which is what
// makes the prompt appear exactly once per account - a later sign-in reads
// terms_accepted: true from the login response and goes straight to the
// dashboard. Cancelling signs the user out, since they cannot use the system
// until they agree, and it keeps the gate meaningful instead of dismissible.
function TermsGate({ children }) {
  const { user, logout, updateUser } = useAuth();
  const adminAuth = useAdminAuth() || {};
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!user || user.terms_accepted) return children;

  const handleCancel = async () => {
    // Admin sessions revoke through /admin/logout via AdminAuthContext, so the
    // role-aware handler is used here for the same reason the dashboards use it.
    await (adminAuth.logout || logout)();
  };

  const handleAgree = async () => {
    // Guarded against a double click so the acceptance is recorded once.
    if (busy) return;
    setBusy(true);
    try {
      await acceptTermsAgreement();
      updateUser({ terms_accepted: true });
    } catch (err) {
      showToast(err.message || 'Could not save your acceptance. Please try again.', 'error');
      setBusy(false);
    }
  };

  return <TermsAgreementGate onAgree={handleAgree} onCancel={handleCancel} busy={busy} />;
}

function ProtectedRoute({ children, allowedRoles, redirectTo = '/login' }) {
  const { user } = useAuth();
  const { status: maintenance } = useMaintenance();

  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo} replace />;
  }

  // The server already refuses non-admin calls during maintenance; this stops
  // the UI from rendering a page whose every request is about to fail.
  if (maintenance.enabled && user && user.role !== 'admin') {
    return <MaintenanceScreen />;
  }

  // Last check, after maintenance: an account that has not accepted the Terms
  // and Agreement gets the agreement instead of the dashboard. Declining logs
  // the user out, so this must come after every other gate that can redirect.
  return <TermsGate>{children}</TermsGate>;
}

// Shown on the public login routes so a blocked user sees the reason instead of
// an unexplained sign-in failure.
//
// Only applies once we know the visitor is a non-admin. A logged-out visitor has
// no role yet, and treating that as "not an admin" would hide the admin login
// form while maintenance is on, leaving no way to sign in and turn it back off.
// The server still refuses non-admin logins on submit, so nothing gets through.
function MaintenanceAware({ children }) {
  const { status: maintenance } = useMaintenance();
  const { user } = useAuth();

  const blocked = maintenance.enabled && user && user.role !== 'admin';
  return blocked ? <MaintenanceScreen /> : children;
}

function AppRoutes() {
  const { user, login, logout } = useAuth();
  const { logout: adminLogout } = useAdminAuth() || {};

  return (
    <Routes>
      <Route path="/login" element={<MaintenanceAware><LoginAndFRegister onAuthSuccess={login} /></MaintenanceAware>} />
      <Route path="/admin/login" element={<MaintenanceAware><AdminLogin onAuthSuccess={login} /></MaintenanceAware>} />
      <Route path="/register" element={<MaintenanceAware><LoginAndFRegister onAuthSuccess={login} /></MaintenanceAware>} />
      <Route path="/set-password" element={<MaintenanceAware><SetPassword /></MaintenanceAware>} />
      <Route path="/forgot-password" element={<MaintenanceAware><ForgotPassword /></MaintenanceAware>} />

      <Route path="/dashboard">
        <Route
          path="admin/*"
          element={
            <ProtectedRoute allowedRoles={['admin']} redirectTo="/admin/login">
              <AdminDashboard user={user} onLogout={adminLogout} />
            </ProtectedRoute>
          }
        />
        <Route path="coordinator/*" element={<ProtectedRoute allowedRoles={['coordinator']}><CoordinatorDashboard user={user} onLogout={logout} /></ProtectedRoute>} />
        <Route path="teacher/*" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherDashboard user={user} onLogout={logout} /></ProtectedRoute>} />
        <Route path="student/*" element={<ProtectedRoute allowedRoles={['student']}><StudentDashboard user={user} onLogout={logout} /></ProtectedRoute>} />
        <Route
          path="supervisor/*"
          element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <SupervisorDashboard user={user} onLogout={logout} />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="/" element={user ? <Navigate to={`/dashboard/${user.role}`} replace /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default AppRoutes;
