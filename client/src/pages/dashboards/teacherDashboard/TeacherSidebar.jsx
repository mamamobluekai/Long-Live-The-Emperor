import DashboardSidebar from '../sharedSidebar/DashboardSidebar';

import {
  ChartNoAxesColumn,
  Users,
  ClipboardPenLine,
  CalendarDays,
  Map,
  FileText,
  MessageCircle,
  MessagesSquare,
  Settings,
  User,
  FolderOpen,
} from 'lucide-react';

const links = [
  {
    to: '/dashboard/teacher',
    label: 'Dashboard',
    icon: ChartNoAxesColumn,
    end: true,
  },
  {
    to: '/dashboard/teacher/students',
    label: 'Students',
    icon: Users,
  },
  {
    to: '/dashboard/teacher/evaluations',
    label: 'Evaluations',
    icon: ClipboardPenLine,
  },
  {
    to: '/dashboard/teacher/attendance-reports',
    label: 'Attendance Reports & Records',
    icon: CalendarDays,
  },
  {
    to: '/dashboard/teacher/attendance',
    label: 'Attendance Schedule',
    icon: CalendarDays,
  },
  {
    to: '/dashboard/teacher/student-documentation',
    label: 'Student Documentation',
    icon: FolderOpen,
  },
  {
    to: '/dashboard/teacher/live-map',
    label: 'Live Map',
    icon: Map,
  },
  {
    to: '/dashboard/teacher/reports-concerns',
    label: 'Reports & Concerns',
    icon: FileText,
  },
  {
    to: '/dashboard/teacher/social-feed',
    label: 'Social Feed',
    icon: MessageCircle,
  },
  {
    to: '/dashboard/teacher/group-chat',
    label: 'Group Chat',
    icon: MessagesSquare,
  },
  {
    to: '/dashboard/teacher/settings',
    label: 'Settings',
    icon: Settings,
  },
  {
    to: '/dashboard/teacher/profile',
    label: 'Profile Settings',
    icon: User,
  },
];

function TeacherSidebar() {
  return (
    <DashboardSidebar
      title="Teacher"
      subtitle="Work Immersion"
      links={links}
    />
  );
}

export default TeacherSidebar;