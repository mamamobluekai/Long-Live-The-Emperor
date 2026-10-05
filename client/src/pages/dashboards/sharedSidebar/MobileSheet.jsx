import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useMobileKeyboardFocus } from '../../../hooks/useMobileKeyboardFocus';
import styles from './MobileSheet.module.css';

// Phone-only slide-up sheet. Desktop never renders this, so it introduces no
// behaviour change at larger widths.
export default function MobileSheet({ isOpen, title, onClose, children }) {
  const panelRef = useRef(null);

  // The form inside has real inputs, so the keyboard has to be able to shrink the
  // sheet and scroll the focused field back into view.
  useMobileKeyboardFocus(110);

  // Escape closes, matching the other menus in the app.
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Stop the page behind the sheet from scrolling while it is open. Restores the
  // previous inline value rather than clearing it, so it cannot clobber a scroll
  // position set elsewhere.
  useEffect(() => {
    if (!isOpen) return undefined;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Clicks inside must not bubble to the overlay's dismiss handler.
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </header>

        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body
  );
}