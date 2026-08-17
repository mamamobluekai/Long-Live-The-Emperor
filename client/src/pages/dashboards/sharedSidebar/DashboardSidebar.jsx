import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import styles from './DashboardSidebar.module.css';

function DashboardSidebar({

  links,
  isOpen = false,
  onClose = () => {},
}) {
  return (
    <>
      {/* =========================================
          MOBILE OVERLAY
      ========================================= */}
      {isOpen && (
        <div
          className={styles.scrim}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* =========================================
          SIDEBAR
      ========================================= */}
      <aside
        className={`${styles.sidebar} ${
          isOpen ? styles.open : ''
        }`}
      >

        {/* =========================================
            HEADER
        ========================================= */}
        <div className={styles.header}>

          

          {/* Mobile close button */}
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X
              size={22}
              strokeWidth={2}
            />
          </button>

        </div>


        {/* =========================================
            NAVIGATION
        ========================================= */}
        <nav
          className={styles.navigation}
          aria-label="Primary navigation"
        >
          <ul className={styles.navList}>

            {links.map((link) => {
              const Icon = link.icon;

              return (
                <li
                  key={link.to}
                  className={styles.navItem}
                >

                  <NavLink
                    to={link.to}
                    end={link.end}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `${styles.navLink} ${
                        isActive
                          ? styles.active
                          : ''
                      }`
                    }
                  >

                    {/* Active indicator */}
                    <span
                      className={styles.activeBar}
                      aria-hidden="true"
                    />

                    {/* Icon */}
                    <span
                      className={styles.linkIcon}
                      aria-hidden="true"
                    >
                      {Icon && (
                        <Icon
                          size={20}
                          strokeWidth={2}
                        />
                      )}
                    </span>

                    {/* Label */}
                    <span className={styles.linkLabel}>
                      {link.label}
                    </span>

                    {/* Badge */}
                    {link.badge != null && (
                      <span className={styles.badge}>
                        {link.badge}
                      </span>
                    )}

                  </NavLink>

                </li>
              );
            })}

          </ul>
        </nav>

      </aside>
    </>
  );
}

export default DashboardSidebar;