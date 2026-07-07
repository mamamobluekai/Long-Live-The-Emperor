import './../styles/feedback.css';

const ICONS = {
  error: '!',
  success: '✓',
  warning: '!',
  info: 'i',
};

const LABELS = {
  error: 'Error',
  success: 'Success',
  warning: 'Warning',
  info: 'Info',
};

export default function Feedback({ type = 'error', message, children, onClose }) {
  const content = message ?? children;
  if (!content) return null;

  return (
    <div className={`wim-feedback wim-feedback--${type}`} role="alert">
      <span className="wim-feedback__icon" aria-hidden="true">
        {ICONS[type] || '!'}
      </span>
      <div className="wim-feedback__body">
        <span className="wim-feedback__label" style={{ fontWeight: 600, marginRight: 6 }}>
          {LABELS[type] || 'Notice'}:
        </span>
        {content}
      </div>
      {onClose ? (
        <button type="button" className="wim-feedback__close" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}
