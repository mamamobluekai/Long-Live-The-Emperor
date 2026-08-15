import {
  LayoutDashboard,
  TrendingUp,
  ClipboardList,
  FileText,
  MapPin,
  Megaphone,
  CalendarCheck,
  MessageCircle,
  UserCog,
} from 'lucide-react';

export const sidebarMenu = {

  student: [
    {
      label: 'Overview',
      path: '/student/overview',
      icon: LayoutDashboard,
    },
    {
      label: 'Progress',
      path: '/student/progress',
      icon: TrendingUp,
    },
    {
      label: 'Requirements',
      path: '/student/requirements',
      icon: ClipboardList,
    },
    {
      label: 'Documentation',
      path: '/student/documentation',
      icon: FileText,
    },
    {
      label: 'Placement Status',
      path: '/student/placement',
      icon: MapPin,
    },
    {
      label: 'Announcements',
      path: '/student/announcements',
      icon: Megaphone,
    },
    {
      label: 'Attendance',
      path: '/student/attendance',
      icon: CalendarCheck,
    },
    {
      label: 'Group Chat',
      path: '/student/group-chat',
      icon: MessageCircle,
    },
    {
      label: 'Profile Settings',
      path: '/student/profile',
      icon: UserCog,
    },
  ],

  // teacher: [],
  // coordinator: [],
  // supervisor: []

};