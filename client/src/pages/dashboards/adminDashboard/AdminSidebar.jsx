import { NavLink } from 'react-router-dom';
import styles from './AdminSidebar.module.css';

function AdminSidebar() {
  return (
    <nav className={styles.sidebar}>
      <div className={styles.header}>
        <h2>Admin Panel</h2>
      </div>
      <ul className={styles.navList}>
        <li>
          <NavLink to="/dashboard/admin/users" className={styles.navLink} end>
            User Management
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/admin/upload-users" className={styles.navLink}>
            Upload Users
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

export default AdminSidebar;