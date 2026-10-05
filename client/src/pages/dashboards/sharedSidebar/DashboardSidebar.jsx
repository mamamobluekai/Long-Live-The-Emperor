import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import SidebarLogoutButton from './SidebarLogoutButton';
import styles from './DashboardSidebar.module.css';

function DashboardSidebar({
  title,
  subtitle,
  links,
  isOpen = false,
  onClose = () => {},
  aboveNav = null,
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
            BRANDING
            Sits inside the sidebar's own flow at the very top, so it can
            never be overlapped by the topbar (which now starts to the right
            of this column).
        ========================================= */}
        <div className={styles.branding}>

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

          <div className={styles.logoWrap}>
            <img
              src="/logo.png"
              alt="Work Immersion Monitoring System"
              className={styles.logo}
            />
          </div>

          <span className={styles.systemName}>
            e-MMERSION
          </span>

          {(title || subtitle) && (
            <span className={styles.panelName}>
              {subtitle ? `${title} · ${subtitle}` : title}
            </span>
          )}

        </div>


        {/* =========================================
            OPTIONAL CONTENT ABOVE NAVIGATION
        ========================================= */}
        {aboveNav}

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

        {/* =========================================
            LOGOUT
            ========================================= */}
        <div className={styles.footer}>
          <SidebarLogoutButton onLoggedOut={onClose} />
        </div>

      </aside>
    </>
  );
}

export default DashboardSidebar;