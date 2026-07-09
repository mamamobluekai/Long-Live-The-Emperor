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
          <NavLink to="/dashboard/teacher" end className={styles.navLink}>
            Overview
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/teacher/documents" className={styles.navLink}>
            Student Documents
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/teacher/live-map" className={styles.navLink}>
            Live Map
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

export default TeacherSidebar;
