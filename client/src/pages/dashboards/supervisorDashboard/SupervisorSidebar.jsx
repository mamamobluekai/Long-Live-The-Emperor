import DashboardSidebar from '../sharedSidebar/DashboardSidebar';
import UserProfileSettings from '../UserProfileSettings';

import {
  ChartNoAxesColumn,
  Upload,
  Layers,
  CalendarDays,
  ClipboardPenLine,
  ScrollText,
  User,
  Megaphone,
  FileText,
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
    label: 'Request Students',
    icon: Upload,
  },
  {
    to: '/dashboard/supervisor/students',
    label: 'Batches',
    icon: Layers,
  },
  {
    to: '/dashboard/supervisor/attendance',
    label: 'Student Attendance',
    icon: CalendarDays,
  },
  {
    to: '/dashboard/supervisor/attendance-schedule',
    label: 'Attendance Schedule',
    icon: CalendarDays,
  },
  {
    to: '/dashboard/supervisor/reports-concerns',
    label: 'My Reports & Concerns',
    icon: FileText,
  },
  {
    to: '/dashboard/supervisor/evaluate',
    label: 'Evaluate Student',
    icon: ClipboardPenLine,
  },
  // 'Student Criteria' was retired: criteria are now edited from the
  // "Grading Criteria" modal on the Evaluate Student page.
   {
    to: '/dashboard/supervisor/grade-appeals',
    label: 'Grade Appeals',
    icon: FileText,
  },
  {
    to: '/dashboard/supervisor/certifications',
    label: 'Certifications',
    icon: ScrollText,
  },
 
  {
    to: '/dashboard/supervisor/announcements',
    label: 'Announcements',
    icon: Megaphone,
  },
  {
    to: '/dashboard/supervisor/profile',
    label: 'Settings',
    icon: User,
    // Phone only: opens in a slide-up sheet instead of navigating. Desktop
    // still navigates to the route above.
    sheet: UserProfileSettings,
    sheetTitle: 'Settings',
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