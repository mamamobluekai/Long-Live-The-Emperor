import { createContext, useEffect, useRef, useState } from 'react';
import { ServerCrash, X } from 'lucide-react';
import { mapErrorResponse } from '../../utils/errors';
import styles from './ServerErrorModal.module.css';

const ServerErrorContext = createContext(null);

function isApiRequest(input) {
  const url = typeof input === 'string' ? input : input?.url || '';
  return url.includes('/api/') || url.includes('localhost:5000');
}

async function getFriendlyResponseError(response) {
  const data = await response.clone().json().catch(() => ({}));
  return mapErrorResponse(data).message;
}

function ServerErrorModal({ open, title = 'Something went wrong', message, onClose }) {

  useEffect(() => {
    if (!open) return undefined;

    const timeoutId = window.setTimeout(() => {
      onClose?.();
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="server-error-title" aria-describedby="server-error-message">
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
          <X size={20} aria-hidden="true" />
        </button>
        <div className={styles.iconWrap} aria-hidden="true"><ServerCrash size={34} strokeWidth={1.8} /></div>
        <h2 id="server-error-title" className={styles.title}>{title}</h2>
        <p id="server-error-message" className={styles.message}>{message || 'We could not complete that request. Please try again.'}</p>
      </div>
    </div>
  );
}

export function ServerErrorProvider({ children }) {
  const [modal, setModal] = useState({ open: false, message: '' });
  const pendingRef = useRef(null);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const waitForRetry = (input, init, message, originalError) => new Promise((resolve, reject) => {
      pendingRef.current = { input, init, resolve, reject, originalError };
      setModal({ open: true, message });
      document.body.classList.add('server-error-open');
    });

    window.fetch = async (input, init) => {
      if (!isApiRequest(input)) return originalFetch(input, init);

      try {
        const response = await originalFetch(input, init);
        if (response.ok) return response;
        const message = await getFriendlyResponseError(response);
        return waitForRetry(input, init, message, new Error(message));
      } catch (error) {
        const message = mapErrorResponse({ error: error.message }).message;
        return waitForRetry(input, init, message, error);
      }
    };

    return () => {
      window.fetch = originalFetch;
      pendingRef.current?.reject(new Error('Request cancelled.'));
      pendingRef.current = null;
      document.body.classList.remove('server-error-open');
    };
  }, []);

  const handleClose = () => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setModal({ open: false, message: '' });
    document.body.classList.remove('server-error-open');
    pending?.reject(pending.originalError || new Error('Request cancelled.'));
  };

  return (
    <ServerErrorContext.Provider value={{ reportError: (message) => setModal({ open: true, message }) }}>
      {children}
      <ServerErrorModal open={modal.open} message={modal.message} onClose={handleClose} />
    </ServerErrorContext.Provider>
  );
}

export default ServerErrorModal;