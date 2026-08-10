import { Routes, Route, Navigate } from 'react-router-dom';
import AdminTopNav from '../../../components/admin/AdminTopNav';
import AdminSidebar from './AdminSidebar';
import Dashboard from './Dashboard';
import UserManagement from './UserManagement';
import Coordinators from './Coordinators';
import Settings from './Settings';
import AdminProfileSettings from './AdminProfileSettings';
import Reports from './Reports';
import AccessLogs from './AccessLogs';
import Notifications from './Notifications';
import UploadUsers from './UploadUsers';
import styles from './AdminDashboard.module.css';

function AdminDashboard({ user, onLogout }) {
  return (
    <div className={styles.shell}>
      <AdminTopNav user={user} onLogout={onLogout} />
      <div className={styles.layout}>
        <AdminSidebar />
        <main className={styles.content}>
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
        </main>
      </div>
    </div>
  );
}

export default AdminDashboard;
