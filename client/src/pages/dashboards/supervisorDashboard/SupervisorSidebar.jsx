import DashboardSidebar from '../sharedSidebar/DashboardSidebar';

const links = [
  { to: '/dashboard/supervisor', label: 'Dashboard', icon: '📊', end: true },
  { to: '/dashboard/supervisor/create-deployment-request', label: 'Create Deployment Request', icon: '📤' },
  { to: '/dashboard/supervisor/students', label: 'Students', icon: '👥' },
  { to: '/dashboard/supervisor/attendance', label: 'Student Attendance', icon: '📅' },
  { to: '/dashboard/supervisor/evaluate', label: 'Evaluate Student', icon: '📝' },
  { to: '/dashboard/supervisor/evaluation', label: 'Student Criteria', icon: '📋' },
  { to: '/dashboard/supervisor/certifications', label: 'Certifications', icon: '📜' },
  { to: '/dashboard/supervisor/social-feed', label: 'Social Feed', icon: '💬' },
  { to: '/dashboard/supervisor/group-chat', label: 'Group Chat', icon: '🗨️' },
  { to: '/dashboard/supervisor/profile', label: 'Profile Settings', icon: '👤' },
];

function SupervisorSidebar() {
  return <DashboardSidebar title="Supervisor" subtitle="Deployment Requests" links={links} />;
}

export default SupervisorSidebar;
