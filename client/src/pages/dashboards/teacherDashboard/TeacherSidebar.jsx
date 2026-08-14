import DashboardSidebar from '../sharedSidebar/DashboardSidebar';

const links = [
  { to: '/dashboard/teacher', label: 'Dashboard', icon: '📊', end: true },
  { to: '/dashboard/teacher/students', label: 'Students', icon: '👥' },
  { to: '/dashboard/teacher/evaluations', label: 'Evaluations', icon: '📝' },
  { to: '/dashboard/teacher/attendance', label: 'Attendance', icon: '📅' },
  { to: '/dashboard/teacher/live-map', label: 'Live Map', icon: '🗺️' },
  { to: '/dashboard/teacher/appeals', label: 'Appeals', icon: '📋' },
  { to: '/dashboard/teacher/reports', label: 'Reports', icon: '📄' },
  { to: '/dashboard/teacher/social-feed', label: 'Social Feed', icon: '💬' },
  { to: '/dashboard/teacher/group-chat', label: 'Group Chat', icon: '🗨️' },
  { to: '/dashboard/teacher/settings', label: 'Settings', icon: '⚙️' },
  { to: '/dashboard/teacher/profile', label: 'Profile Settings', icon: '👤' },
];

function TeacherSidebar() {
  return <DashboardSidebar title="Teacher" subtitle="Work Immersion" links={links} />;
}

export default TeacherSidebar;
