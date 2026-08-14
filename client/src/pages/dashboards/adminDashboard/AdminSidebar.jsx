import DashboardSidebar from '../sharedSidebar/DashboardSidebar';

const links = [
  { to: '/dashboard/admin', label: 'Dashboard', icon: '📊', end: true },
  { to: '/dashboard/admin/users', label: 'User Management', icon: '👥' },
  { to: '/dashboard/admin/coordinators', label: 'Coordinator Approval', icon: '✅' },
  { to: '/dashboard/admin/reports', label: 'Reports', icon: '📄' },
  { to: '/dashboard/admin/settings', label: 'System Settings', icon: '⚙️' },
  { to: '/dashboard/admin/profile', label: 'Profile Settings', icon: '👤' },
  { to: '/dashboard/admin/access-logs', label: 'Access Logs', icon: '🔍' },
  { to: '/dashboard/admin/notifications', label: 'Notifications', icon: '🔔' },
  { to: '/dashboard/admin/upload-users', label: 'Upload Users', icon: '📤' },
];

function AdminSidebar() {
  return <DashboardSidebar title="Admin Panel" links={links} />;
}

export default AdminSidebar;
