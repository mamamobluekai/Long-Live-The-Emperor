import { NavLink } from 'react-router-dom';
import styles from './SupervisorSidebar.module.css';

function SupervisorSidebar() {
  return (
    <nav className={styles.sidebar}>
      <div className={styles.header}>
        <h2>Supervisor</h2>
        <p className={styles.subtitle}>Deployment Requests</p>
      </div>
      <ul className={styles.navList}>
        <li>
          <NavLink to="/dashboard/supervisor" end className={styles.navLink}>
            Dashboard
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/supervisor/create-deployment-request" className={styles.navLink}>
            Create Deployment Request
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/supervisor/my-requests" className={styles.navLink}>
            My Requests
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/supervisor/attendance" className={styles.navLink}>
            Student Attendance
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

export default SupervisorSidebar;
