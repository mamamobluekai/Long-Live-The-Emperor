import { useState } from 'react';
import { LogOut } from 'lucide-react';
import LogoutConfirmDialog from './LogoutConfirmDialog';
import styles from './SidebarLogoutButton.module.css';

export default function SidebarLogoutButton({ onLoggedOut }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.logoutButton}
        onClick={() => setIsOpen(true)}
      >
        <span className={styles.logoutIcon} aria-hidden="true">
          <LogOut size={20} strokeWidth={2} />
        </span>
        <span className={styles.logoutLabel}>Log out</span>
      </button>

      <LogoutConfirmDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onLoggedOut={onLoggedOut}
      />
    </>
  );
}