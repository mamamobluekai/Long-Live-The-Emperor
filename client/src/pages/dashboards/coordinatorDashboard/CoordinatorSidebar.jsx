import DashboardSidebar from '../sharedSidebar/DashboardSidebar';

import {
  Users,
  ClipboardList,
  Library,
  BriefcaseBusiness,
  MessageCircle,
  User,
} from 'lucide-react';

const links = [
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
    to: '/dashboard/coordinator/social-feed',
    label: 'Social Feed',
    icon: MessageCircle,
  },
  {
    to: '/dashboard/coordinator/profile',
    label: 'Profile Settings',
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