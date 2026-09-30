import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminAuth } from '../context/useAdminAuth';
import { useMaintenance } from '../context/maintenanceContextValue';
import MaintenanceScreen from '../components/common/MaintenanceScreen';
import LoginAndFRegister from '../pages/LoginAndRegister/LoginAndFRegister';
import AdminLogin from '../pages/admin/AdminLogin';
import AdminDashboard from '../pages/dashboards/adminDashboard/AdminDashboard';
import CoordinatorDashboard from '../pages/dashboards/coordinatorDashboard/CoordinatorDashboard';
import TeacherDashboard from '../pages/dashboards/teacherDashboard/TeacherDashboard';
import StudentDashboard from '../pages/dashboards/studentDashboard/studentDashboard';
import SupervisorDashboard from '../pages/dashboards/supervisorDashboard/SupervisorDashboard';
import SetPassword from '../pages/SetPassword/SetPassword';
import ForgotPassword from '../pages/ForgotPassword/ForgotPassword';

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

  return children;
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
