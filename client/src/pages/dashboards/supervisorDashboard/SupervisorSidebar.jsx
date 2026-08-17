import DashboardSidebar from '../sharedSidebar/DashboardSidebar';

import {
  ChartNoAxesColumn,
  Upload,
  Users,
  CalendarDays,
  ClipboardPenLine,
  ClipboardList,
  ScrollText,
  MessageCircle,
  MessagesSquare,
  User,
} from 'lucide-react';

const links = [
  {
    to: '/dashboard/supervisor',
    label: 'Dashboard',
    icon: ChartNoAxesColumn,
    end: true,
  },
  {
    to: '/dashboard/supervisor/create-deployment-request',
    label: 'Create Deployment Request',
    icon: Upload,
  },
  {
    to: '/dashboard/supervisor/students',
    label: 'Students',
    icon: Users,
  },
  {
    to: '/dashboard/supervisor/attendance',
    label: 'Student Attendance',
    icon: CalendarDays,
  },
  {
    to: '/dashboard/supervisor/evaluate',
    label: 'Evaluate Student',
    icon: ClipboardPenLine,
  },
  {
    to: '/dashboard/supervisor/evaluation',
    label: 'Student Criteria',
    icon: ClipboardList,
  },
  {
    to: '/dashboard/supervisor/certifications',
    label: 'Certifications',
    icon: ScrollText,
  },
  {
    to: '/dashboard/supervisor/social-feed',
    label: 'Social Feed',
    icon: MessageCircle,
  },
  {
    to: '/dashboard/supervisor/group-chat',
    label: 'Group Chat',
    icon: MessagesSquare,
  },
  {
    to: '/dashboard/supervisor/profile',
    label: 'Profile Settings',
    icon: User,
  },
];

function SupervisorSidebar({ isOpen, onClose }) {
  return (
    <DashboardSidebar
      title="Supervisor"
      subtitle="Deployment Requests"
      links={links}
      isOpen={isOpen}
      onClose={onClose}
    />
  );
}

export default SupervisorSidebar;