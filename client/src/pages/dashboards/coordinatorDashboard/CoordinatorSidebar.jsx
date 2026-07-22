import { NavLink } from 'react-router-dom';
import styles from './CoordinatorSidebar.module.css';

function CoordinatorSidebar() {
  return (
    <nav className={styles.sidebar}>
      <div className={styles.header}>
        <h2>Coordinator</h2>
        <p className={styles.subtitle}>Work Immersion Office</p>
      </div>
      <ul className={styles.navList}>
        <li>
          <NavLink to="/dashboard/coordinator/students" className={styles.navLink}>
            Student Approvals
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/coordinator/upload-students" className={styles.navLink}>
            Upload Students
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/coordinator/requirements" className={styles.navLink}>
            Requirements
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/coordinator/batches" className={styles.navLink}>
            Teacher Batches
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard/coordinator/supervisors" className={styles.navLink}>
            Supervisors
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

export default CoordinatorSidebar;
