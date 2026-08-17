import {
  LayoutDashboard,
  TrendingUp,
  ClipboardList,
  FolderOpen,
  MapPin,
  FilePenLine,
  Megaphone,
  CalendarDays,
  MessageCircle,
  UserRound,
} from 'lucide-react';

import DashboardSidebar from '../sharedSidebar/DashboardSidebar';


const links = [
  {
    to: '/dashboard/student',
    label: 'Dashboard',
    icon: LayoutDashboard,
    end: true,
  },

  {
    to: '/dashboard/student/progress',
    label: 'Progress',
    icon: TrendingUp,
  },

  {
    to: '/dashboard/student/requirements',
    label: 'Requirements',
    icon: ClipboardList,
  },

  {
    to: '/dashboard/student/documentation',
    label: 'Documentation',
    icon: FolderOpen,
  },

  {
    to: '/dashboard/student/placement-status',
    label: 'Placement Status',
    icon: MapPin,
  },

  {
    to: '/dashboard/student/evaluation',
    label: 'Grades',
    icon: FilePenLine,
  },

  {
    to: '/dashboard/student/announcements',
    label: 'Announcements',
    icon: Megaphone,
  },

  {
    to: '/dashboard/student/attendance',
    label: 'Attendance',
    icon: CalendarDays,
  },

  {
    to: '/dashboard/student/group-chat',
    label: 'Group Chat',
    icon: MessageCircle,
  },

  {
    to: '/dashboard/student/profile',
    label: 'Profile Settings',
    icon: UserRound,
  },
];


function StudentSidebar({ isOpen, onClose }) {
  return (
    <DashboardSidebar
      title="Student"
      subtitle="Work Immersion"
      links={links}
      isOpen={isOpen}
      onClose={onClose}
    />
  );
}


export default StudentSidebar;