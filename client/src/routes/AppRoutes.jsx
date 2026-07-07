import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoginAndFRegister from '../pages/LoginAndRegister/LoginAndFRegister';
import AdminDashboard from '../pages/dashboards/adminDashboard/AdminDashboard';
import CoordinatorDashboard from '../pages/dashboards/coordinatorDashboard/CoordinatorDashboard';
import TeacherDashboard from '../pages/dashboards/teacherDashboard/TeacherDashboard';
import StudentDashboard from '../pages/dashboards/studentDashboard/StudentDashboard';
import SupervisorDashboard from '../pages/dashboards/supervisorDashboard/SupervisorDashboard';
import SetPassword from '../pages/SetPassword/SetPassword';

function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AppRoutes() {
  const { user, login, logout } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginAndFRegister onAuthSuccess={login} />} />
      <Route path="/register" element={<LoginAndFRegister onAuthSuccess={login} />} />
      <Route path="/set-password" element={<SetPassword />} />

      <Route path="/dashboard">
        <Route path="admin/*" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard user={user} onLogout={logout} /></ProtectedRoute>} />
        <Route path="coordinator/*" element={<ProtectedRoute allowedRoles={['coordinator']}><CoordinatorDashboard user={user} onLogout={logout} /></ProtectedRoute>} />
        <Route path="teacher" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherDashboard user={user} onLogout={logout} /></ProtectedRoute>} />
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
