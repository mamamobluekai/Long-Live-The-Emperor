import { NavLink } from 'react-router-dom';
import styles from './DashboardSidebar.module.css';

function DashboardSidebar({ title, subtitle, links, isOpen, onClose }) {
  return (
    <>
      {isOpen && <div className={styles.scrim} onClick={onClose} aria-hidden="true" />}
      <nav
        className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}
        aria-label="Primary"
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>

        <ul className={styles.navList}>
          {links.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.active : ''}`
                }
              >
                <span className={styles.activeBar} aria-hidden="true" />
                <span className={styles.linkIcon} aria-hidden="true">
                  {link.icon}
                </span>
                <span className={styles.linkLabel}>{link.label}</span>
                {link.badge != null && (
                  <span className={styles.badge}>{link.badge}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

export default DashboardSidebar;