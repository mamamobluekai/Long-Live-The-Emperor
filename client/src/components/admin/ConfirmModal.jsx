import { useState } from 'react';
import styles from './ConfirmModal.module.css';

export default function ConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  // Shown in place of `confirmLabel` while the action is still running, e.g.
  // "Sending email..." for an approval. Falls back to `confirmLabel`.
  loadingLabel,
  onConfirm,
  onClose,
}) {
  // Activating an account sends a Gmail message before it answers, so the
  // confirm button stays disabled with a spinner until the request settles -
  // otherwise the dialog vanishes instantly and the admin is left with no
  // indication of whether the mail went out.
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    // Guards a double click: without it, two PATCH requests would fire and the
    // approval mail would be sent twice.
    if (busy) return;
    setBusy(true);
    try {
      // Awaited so the dialog closes only after the work actually finished.
      // Existing callers that return nothing still close straight away.
      await onConfirm?.();
      onClose?.();
    } catch {
      // Callers report their own failures with a toast; swallowing here keeps a
      // rejected action from surfacing as an unhandled rejection and leaving the
      // button spinning forever.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className={styles.modal}>
        <h2 id="confirm-title" className={styles.title}>{title}</h2>
        {message ? <p className={styles.message}>{message}</p> : null}
        {busy && loadingLabel ? <p className={styles.loadingNote}>{loadingLabel}</p> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={isDestructive ? styles.destructiveBtn : styles.confirmBtn}
            onClick={handleConfirm}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? <span className={styles.spinner} aria-hidden="true" /> : null}
            {busy && loadingLabel ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
