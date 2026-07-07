import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardShell from '../DashboardShell';
import AdminSidebar from './AdminSidebar';
import UserManagement from './UserManagement';
import UploadUsers from './UploadUsers';
import styles from './AdminDashboard.module.css';

function AdminDashboard({ user, onLogout }) {
  return (
    <DashboardShell user={user} title="Admin Dashboard" onLogout={onLogout}>
      <div className={styles.layout}>
        <AdminSidebar />
        <div className={styles.content}>
          <Routes>
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="upload-users" element={<UploadUsers />} />
          </Routes>
        </div>
      </div>
    </DashboardShell>
  );
}

export default AdminDashboard;