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
      label: 'Attendance',
      path: '/student/attendance',
      icon: CalendarCheck,
    },
    
    {
      label: 'Placement Status',
      path: '/student/placement',
      icon: MapPin,
    },
    {
      label: 'Documentation',
      path: '/student/documentation',
      icon: FileText,
    },
    {
      label: 'Announcements',
      path: '/student/announcements',
      icon: Megaphone,
    },
   
    {
      label: 'Group Chat',
      path: '/student/group-chat',
      icon: MessageCircle,
    },
    {
      label: 'Settings',
      path: '/student/profile',
      icon: UserCog,
    },
  ],

  // teacher: [],
  // coordinator: [],
  // supervisor: []

};