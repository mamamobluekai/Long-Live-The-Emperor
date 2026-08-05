import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminAuth } from '../context/AdminAuthContext';
import LoginAndFRegister from '../pages/LoginAndRegister/LoginAndFRegister';
import AdminLogin from '../pages/admin/AdminLogin';
import AdminDashboard from '../pages/dashboards/adminDashboard/AdminDashboard';
import CoordinatorDashboard from '../pages/dashboards/coordinatorDashboard/CoordinatorDashboard';
import TeacherDashboard from '../pages/dashboards/teacherDashboard/TeacherDashboard';
import StudentDashboard from '../pages/dashboards/studentDashboard/StudentDashboard';
import SupervisorDashboard from '../pages/dashboards/supervisorDashboard/SupervisorDashboard';
import SetPassword from '../pages/SetPassword/SetPassword';

function ProtectedRoute({ children, allowedRoles, redirectTo = '/login' }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}

function AppRoutes() {
  const { user, login, logout } = useAuth();
  const { logout: adminLogout } = useAdminAuth() || {};

  return (
    <Routes>
      <Route path="/login" element={<LoginAndFRegister onAuthSuccess={login} />} />
      <Route path="/admin/login" element={<AdminLogin onAuthSuccess={login} />} />
      <Route path="/register" element={<LoginAndFRegister onAuthSuccess={login} />} />
      <Route path="/set-password" element={<SetPassword />} />

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
