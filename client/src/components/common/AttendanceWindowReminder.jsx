import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Clock3, X } from 'lucide-react';
import styles from './AttendanceWindowReminder.module.css';

function AttendanceWindowReminder() {
  const navigate = useNavigate();
  const [reminder, setReminder] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    function handleMessage(event) {
      const message = event.data;
      if (
        message?.type !== 'ATTENDANCE_WINDOW_OPEN'
        || !['Time In', 'Time Out'].includes(message.actionLabel)
      ) {
        return;
      }

      setReminder({
        title: message.title,
        body: message.body,
        actionLabel: message.actionLabel,
        url: message.url,
      });
    }

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);

  useEffect(() => {
    if (!reminder) return undefined;

    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    const focusableElements = dialog?.querySelectorAll('button:not([disabled])');
    focusableElements?.[0]?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setReminder(null);
        return;
      }

      if (event.key !== 'Tab' || !focusableElements?.length) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [reminder]);

  if (!reminder) return null;

  const openAttendance = () => {
    setReminder(null);
    navigate(reminder.url || '/dashboard/student/attendance');
  };

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setReminder(null);
      }}
    >
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-reminder-title"
        aria-describedby="attendance-reminder-description"
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={() => setReminder(null)}
          aria-label="Dismiss attendance reminder"
        >
          <X size={20} />
        </button>
        <div className={styles.icon} aria-hidden="true">
          <Clock3 size={25} />
        </div>
        <p className={styles.eyebrow}>Attendance window is open</p>
        <h2 id="attendance-reminder-title">{reminder.actionLabel}</h2>
        <p id="attendance-reminder-description" className={styles.message}>
          {reminder.body || `You can ${reminder.actionLabel.toLowerCase()} now.`}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={openAttendance}
          >
            Go to {reminder.actionLabel}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setReminder(null)}
          >
            Dismiss
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default AttendanceWindowReminder;
