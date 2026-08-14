import DashboardSidebar from '../sharedSidebar/DashboardSidebar';

const links = [
  { to: '/dashboard/coordinator/students', label: 'Student Approvals', icon: '👥' },
  { to: '/dashboard/coordinator/requirements', label: 'Requirements', icon: '📋' },
  { to: '/dashboard/coordinator/batches', label: 'Teacher Batches', icon: '📚' },
  { to: '/dashboard/coordinator/supervisors', label: 'Supervisors', icon: '👔' },
  { to: '/dashboard/coordinator/social-feed', label: 'Social Feed', icon: '💬' },
  { to: '/dashboard/coordinator/profile', label: 'Profile Settings', icon: '👤' },
];

function CoordinatorSidebar() {
  return <DashboardSidebar title="Coordinator" subtitle="Work Immersion Office" links={links} />;
}

export default CoordinatorSidebar;
