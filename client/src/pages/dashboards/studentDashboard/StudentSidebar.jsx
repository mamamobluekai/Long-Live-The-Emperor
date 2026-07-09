import { NavLink } from 'react-router-dom';
import styles from './StudentSidebar.module.css';

function StudentSidebar() {
  return (
    <nav className={styles.sidebar}>
      <div className={styles.header}>
        <h2>Student</h2>
        <p className={styles.subtitle}>Work Immersion</p>
      </div>
      <ul className={styles.navList}>
        <li>
          <NavLink to="/dashboard/student" end className={styles.navLink}>
            Overview
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/student/requirements" className={styles.navLink}>
            Requirements
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/student/documentation" className={styles.navLink}>
            Documentation
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/student/placement-status" className={styles.navLink}>
            Placement Status
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/student/announcements" className={styles.navLink}>
            Announcements
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/student/attendance" className={styles.navLink}>
            Attendance
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

export default StudentSidebar;
