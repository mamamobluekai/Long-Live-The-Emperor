import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import SidebarLogoutButton from './SidebarLogoutButton';
import MobileSheet from './MobileSheet';
import { useIsMobile } from '../../../hooks/useIsMobile';
import styles from './DashboardSidebar.module.css';

function DashboardSidebar({
  title,
  subtitle,
  links,
  isOpen = false,
  onClose = () => {},
  aboveNav = null,
}) {
  const isMobile = useIsMobile();

  // Holds the link whose `sheet` component should be shown in a phone-only sheet.
  const [sheetLink, setSheetLink] = useState(null);

  // On a phone a nav item carrying `sheet` opens in a slide-up sheet rather than
  // navigating. Desktop keeps the normal NavLink navigation, so wide screens are
  // unaffected.
  const handleLinkClick = (event, link) => {
    if (link.sheet && isMobile) {
      event.preventDefault();
      // The sheet is portalled to <body>, so collapsing the drawer it was opened
      // from does not unmount it and leaves no double-panel stack behind.
      onClose();
      setSheetLink(link);
      return;
    }

    onClose();
  };

  const SheetContent = sheetLink?.sheet;

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
                    onClick={(event) => handleLinkClick(event, link)}
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

      {/* =========================================
            PHONE-ONLY SHEET
            Rendered for a link that declared `sheet`, and only while the
            viewport is phone-sized.
        ========================================= */}
        {SheetContent && (
          <MobileSheet
            isOpen={isMobile}
            title={sheetLink.sheetTitle || sheetLink.label}
            onClose={() => setSheetLink(null)}
          >
            <SheetContent />
          </MobileSheet>
        )}

      </aside>
    </>
  );
}

export default DashboardSidebar;