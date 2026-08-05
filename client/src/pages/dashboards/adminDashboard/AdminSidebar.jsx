import { NavLink } from 'react-router-dom';
import styles from './AdminSidebar.module.css';

const links = [
  { to: '/dashboard/admin', label: 'Dashboard', icon: '📊', end: true },
  { to: '/dashboard/admin/users', label: 'User Management', icon: '👥' },
  { to: '/dashboard/admin/coordinators', label: 'Coordinator Approval', icon: '✅' },
  { to: '/dashboard/admin/reports', label: 'Reports', icon: '📄' },
  { to: '/dashboard/admin/settings', label: 'System Settings', icon: '⚙️' },
  { to: '/dashboard/admin/profile', label: 'Profile Settings', icon: '👤' },
  { to: '/dashboard/admin/access-logs', label: 'Access Logs', icon: '🔍' },
  { to: '/dashboard/admin/logs', label: 'Audit Logs', icon: '📜' },
  { to: '/dashboard/admin/notifications', label: 'Notifications', icon: '🔔' },
  { to: '/dashboard/admin/upload-users', label: 'Upload Users', icon: '📤' },
];

function AdminSidebar() {
  return (
    <nav className={styles.sidebar}>
      <div className={styles.header}>
        <h2>Admin Panel</h2>
      </div>
      <ul className={styles.navList}>
        {links.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              className={({ isActive }) =>
                isActive && link.end ? `${styles.navLink} ${styles.active}` : styles.navLink
              }
              end={link.end}
            >
              <span className={styles.linkIcon}>{link.icon}</span>
              <span>{link.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default AdminSidebar;
