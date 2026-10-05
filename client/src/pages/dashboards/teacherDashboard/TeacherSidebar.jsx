import DashboardSidebar from '../sharedSidebar/DashboardSidebar';
import TeacherSidebarBatchSwitcher from './TeacherSidebarBatchSwitcher';
import UserProfileSettings from '../UserProfileSettings';

import {
  ChartNoAxesColumn,
  Users,
  ClipboardPenLine,
  CalendarDays,
  Map,
  FileText,
  Megaphone,
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
    to: '/dashboard/teacher/attendance',
    label: 'Attendance Monitor',
    icon: CalendarDays,
  },

  {
    to: '/dashboard/teacher/live-map',
    label: 'Live Map',
    icon: Map,
  },

  {
    to: '/dashboard/teacher/student-documentation',
    label: 'Student Documentation',
    icon: FolderOpen,
  },

  {
    to: '/dashboard/teacher/evaluations',
    label: 'Student Grades',
    icon: ClipboardPenLine,
  },

  {
    to: '/dashboard/teacher/reports-concerns',
    label: 'Reports & Concerns',
    icon: FileText,
  },

  {
    to: '/dashboard/teacher/announcements',
    label: 'Announcements',
    icon: Megaphone,
  },

  {
    to: '/dashboard/teacher/profile',
    label: 'Settings',
    icon: User,
    // Phone only: opens in a slide-up sheet instead of navigating. Desktop
    // still navigates to the route above.
    sheet: UserProfileSettings,
    sheetTitle: 'Settings',
  },
];

// isOpen/onClose are injected by DashboardLayout. They were previously dropped,
// which left the teacher drawer permanently off-canvas on phones. Forwarded now so
// the mobile nav - and the Settings sheet opened from it - can actually be reached.
function TeacherSidebar({ isOpen, onClose }) {
  return (
    <DashboardSidebar
      title="Teacher"
      subtitle="Work Immersion"
      links={links}
      isOpen={isOpen}
      onClose={onClose}
      aboveNav={<TeacherSidebarBatchSwitcher />}
    />
  );
}

export default TeacherSidebar;