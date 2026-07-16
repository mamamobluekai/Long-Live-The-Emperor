import { NavLink } from 'react-router-dom';
import styles from './TeacherSidebar.module.css';

function TeacherSidebar() {
  return (
    <nav className={styles.sidebar}>
      <div className={styles.header}>
        <h2>Teacher</h2>
        <p className={styles.subtitle}>Work Immersion</p>
      </div>
      <ul className={styles.navList}>
        <li>
          <NavLink to="/dashboard/teacher" end className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}>
            Dashboard
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/teacher/students" className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}>
            Students
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/teacher/attendance" className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}>
            Attendance
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/teacher/live-map" className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}>
            Live Map
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/teacher/appeals" className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}>
            Appeals
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/teacher/reports" className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}>
            Reports
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/teacher/settings" className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}>
            Settings
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

export default TeacherSidebar;
