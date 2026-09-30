import DashboardSidebar from '../sharedSidebar/DashboardSidebar';

import {
  ChartNoAxesColumn,
  Users,
  Settings,
  User,
  Search,
  Upload,
  Archive,
} from 'lucide-react';

const links = [
  {
    to: '/dashboard/admin',
    label: 'Dashboard',
    icon: ChartNoAxesColumn,
    end: true,
  },
  {
    to: '/dashboard/admin/users',
    label: 'User Management',
    icon: Users,
  },
  {
    to: '/dashboard/admin/settings',
    label: 'System Settings',
    icon: Settings,
  },
  {
    to: '/dashboard/admin/profile',
    label: 'Profile Settings',
    icon: User,
  },
  {
    to: '/dashboard/admin/access-logs',
    label: 'Access Logs',
    icon: Search,
  },
  {
    to: '/dashboard/admin/upload-users',
    label: 'Upload Users',
    icon: Upload,
  },
  {
    to: '/dashboard/admin/archives',
    label: 'Archived Periods',
    icon: Archive,
  },
];

function AdminSidebar({ isOpen, onClose }) {
  return (
    <DashboardSidebar
      title="Admin Panel"
      links={links}
      isOpen={isOpen}
      onClose={onClose}
    />
  );
}

export default AdminSidebar;