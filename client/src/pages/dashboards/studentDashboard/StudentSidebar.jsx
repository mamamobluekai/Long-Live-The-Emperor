import DashboardSidebar from '../sharedSidebar/DashboardSidebar';

const links = [
  { to: '/dashboard/student', label: 'Overview', icon: '🏠', end: true },
  { to: '/dashboard/student/progress', label: 'Progress', icon: '📈' },
  { to: '/dashboard/student/requirements', label: 'Requirements', icon: '📋' },
  { to: '/dashboard/student/documentation', label: 'Documentation', icon: '📁' },
  { to: '/dashboard/student/placement-status', label: 'Placement Status', icon: '📍' },
  { to: '/dashboard/student/evaluation', label: 'Grades', icon: '📝' },
  { to: '/dashboard/student/announcements', label: 'Announcements', icon: '📢' },
  { to: '/dashboard/student/attendance', label: 'Attendance', icon: '📅' },
  { to: '/dashboard/student/group-chat', label: 'Group Chat', icon: '💬' },
  { to: '/dashboard/student/profile', label: 'Profile Settings', icon: '👤' },
];

function StudentSidebar() {
  return <DashboardSidebar title="Student" subtitle="Work Immersion" links={links} />;
}

export default StudentSidebar;
