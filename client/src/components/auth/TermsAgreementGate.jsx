import { useEffect, useRef, useState } from 'react';
import styles from './TermsAgreementGate.module.css';
import { TERMS_ACKNOWLEDGEMENT, TERMS_SECTIONS } from '../../config/terms';

/**
 * Blocking, one-time Terms and Agreement prompt.
 *
 * Rendered by the route guard after every sign-in until the user accepts, so it
 * sits above the dashboard rather than in it: cancelling logs the user out and
 * agreeing records the acceptance and reveals the dashboard underneath.
 *
 * Two things make the "once per user" promise real rather than cosmetic. The
 * scroll requirement - the checkbox and buttons stay disabled until the
 * agreement has been scrolled to the bottom - stops someone accepting a document
 * they have not read; and the accept button is disabled until the box is ticked,
 * so the agreement is always an explicit action. The server flag makes it
 * permanent, so this only ever appears once per account no matter which device
 * signs in.
 */
export default function TermsAgreementGate({ onAgree, onCancel, busy = false }) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [checked, setChecked] = useState(false);
  const scrollRef = useRef(null);

  // Locks the page behind the prompt. The agreement is several screens tall and
  // scrolls with the wheel/touch by default, so without this the dashboard
  // underneath would scroll away underneath the modal.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Users who scroll to the bottom by dragging the scrollbar never fire a
  // scroll event on some browsers, so the bottom of the text is observed
  // directly as well.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setScrolledToEnd(true);
      },
      { root: node, threshold: 1 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleScroll = (event) => {
    const node = event.currentTarget;
    // +1 absorbs sub-pixel rounding so the last pixel still counts as "the end".
    if (node.scrollTop + node.clientHeight >= node.scrollHeight - 1) {
      setScrolledToEnd(true);
    }
  };

  const canAgree = scrolledToEnd && checked && !busy;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <div className={styles.modal}>
        <header className={styles.header}>
          <div>
            <h2 id="terms-title" className={styles.title}>
              Terms and Agreement
            </h2>
            <p className={styles.subtitle}>Work Immersion Monitoring System</p>
          </div>
          </header>

        <div
          className={styles.scrollArea}
          ref={scrollRef}
          onScroll={handleScroll}
          tabIndex={0}
          role="region"
          aria-label="Terms and Agreement text"
        >
          {TERMS_SECTIONS.map((section) => (
            <section key={section.title} className={styles.section}>
              <h3 className={styles.sectionTitle}>{section.title}</h3>
              {section.body.map((paragraph) => (
                <p key={paragraph} className={styles.paragraph}>
                  {paragraph}
                </p>
              ))}
              {section.list ? (
                <ul className={styles.list}>
                  {section.list.map((item) => (
                    <li key={item} className={styles.listItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <footer className={styles.footer}>
          {!scrolledToEnd && (
            <p className={styles.hint}>Please read to the end of the agreement to continue.</p>
          )}

          <label className={`${styles.checkRow} ${checked ? styles.checkRowChecked : ''}`}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={checked}
              disabled={!scrolledToEnd || busy}
              onChange={(event) => setChecked(event.target.checked)}
            />
            <span className={styles.checkLabel}>{TERMS_ACKNOWLEDGEMENT}</span>
          </label>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={styles.agreeBtn} onClick={onAgree} disabled={!canAgree}>
              {busy ? 'Saving...' : 'I Agree & Continue'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}