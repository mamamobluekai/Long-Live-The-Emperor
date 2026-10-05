import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmModal from '../../../components/admin/ConfirmModal';
import { useAuth } from '../../../context/AuthContext';
import { useAdminAuth } from '../../../context/useAdminAuth';
import styles from './LogoutConfirmDialog.module.css';

// Admin revoke and user revoke live on different endpoints, so the handler is
// taken from the admin context (which is role-aware) and falls back to the base
// context when no admin provider is mounted.
function useLogoutHandler() {
  const auth = useAuth();
  const adminAuth = useAdminAuth() || {};
  return adminAuth.logout || auth.logout;
}

// On mobile the sidebar drawer is a fixed overlay at z-index 99998, which would
// bury the dialog. Rendering it into a layer above the drawer keeps the dialog
// usable from either the sidebar button or the top-nav menu.
function usePortalLayer() {
  const [host, setHost] = useState(null);

  useEffect(() => {
    if (host) return undefined;

    const node = document.createElement('div');
    node.className = styles.portalLayer;
    document.body.appendChild(node);
    setHost(node);

    return () => node.remove();
  }, [host]);

  return host;
}

export default function LogoutConfirmDialog({ isOpen, onClose, onLoggedOut }) {
  const logout = useLogoutHandler();
  const host = usePortalLayer();

  const handleConfirm = async () => {
    await logout();
    onLoggedOut?.();
  };

  if (!isOpen || !host) return null;

  return createPortal(
    <ConfirmModal
      isOpen
      title="Log out"
      message="Are you sure you want to log out? You will need to sign in again to access your dashboard."
      confirmLabel="Log out"
      cancelLabel="Stay signed in"
      loadingLabel="Logging out..."
      isDestructive
      onConfirm={handleConfirm}
      onClose={onClose}
    />,
    host
  );
}