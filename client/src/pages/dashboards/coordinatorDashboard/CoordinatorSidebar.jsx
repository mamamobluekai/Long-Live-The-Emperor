import DashboardSidebar from '../sharedSidebar/DashboardSidebar';

import {
  Users,
  ClipboardList,
  Library,
  BriefcaseBusiness,
  Megaphone,
  User,
  LayoutDashboard,
} from 'lucide-react';

const links = [
  {
    to: '/dashboard/coordinator',
    label: 'Overview',
    icon: LayoutDashboard,
  },
  {
    to: '/dashboard/coordinator/students',
    label: 'Student Approvals',
    icon: Users,
  },
  {
    to: '/dashboard/coordinator/requirements',
    label: 'Requirements',
    icon: ClipboardList,
  },
  {
    to: '/dashboard/coordinator/batches',
    label: 'Teacher Batches',
    icon: Library,
  },
  {
    to: '/dashboard/coordinator/supervisors',
    label: 'Supervisors',
    icon: BriefcaseBusiness,
  },
  {
    to: '/dashboard/coordinator/announcements',
    label: 'Announcements',
    icon: Megaphone,
  },
  {
    to: '/dashboard/coordinator/profile',
    label: 'Settings',
    icon: User,
  },
];

function CoordinatorSidebar({ isOpen, onClose }) {
  return (
    <DashboardSidebar
      title="Coordinator"
      subtitle="Work Immersion Office"
      links={links}
      isOpen={isOpen}
      onClose={onClose}
    />
  );
}

export default CoordinatorSidebar;