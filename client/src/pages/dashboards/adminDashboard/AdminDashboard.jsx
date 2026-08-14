import { Routes, Route, Navigate } from 'react-router-dom';
import AdminTopNav from '../../../components/admin/AdminTopNav';
import AdminSidebar from './AdminSidebar';
import DashboardLayout from '../sharedSidebar/DashboardLayout';
import Dashboard from './Dashboard';
import UserManagement from './UserManagement';
import Coordinators from './Coordinators';
import Settings from './Settings';
import AdminProfileSettings from './AdminProfileSettings';
import Reports from './Reports';
import AccessLogs from './AccessLogs';
import Notifications from './Notifications';
import UploadUsers from './UploadUsers';

function AdminDashboard({ user, onLogout }) {
  return (
    <DashboardLayout
      topNav={<AdminTopNav user={user} onLogout={onLogout} />}
      sidebar={<AdminSidebar />}
    >
      <Routes>
        <Route index element={<Navigate to="/dashboard/admin/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="coordinators" element={<Coordinators />} />
        <Route path="settings" element={<Settings />} />
        <Route path="profile" element={<AdminProfileSettings />} />
        <Route path="reports" element={<Reports />} />
        <Route path="access-logs" element={<AccessLogs />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="upload-users" element={<UploadUsers />} />
        <Route path="*" element={<Navigate to="/dashboard/admin/dashboard" replace />} />
      </Routes>
    </DashboardLayout>
  );
}

export default AdminDashboard;
