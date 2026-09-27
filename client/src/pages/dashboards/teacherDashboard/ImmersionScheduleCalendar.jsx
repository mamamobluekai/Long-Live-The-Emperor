import { useMemo, useState, useEffect } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import styles from './TeacherAttendance.module.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseISODate(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function toISO({ y, m, d }) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Large calendar view of a batch's immersion days. Immersion days are shaded,
// weekends and other non-attendance days are muted.
function ImmersionScheduleCalendar({ dates = [], title, batchLabel, onClose }) {
  const attendanceDays = useMemo(() => new Set(dates), [dates]);

  const [cursor, setCursor] = useState(() => {
    const first = parseISODate(dates[0]);
    return first ? { y: first.y, m: first.m } : null;
  });

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    const first = parseISODate(dates[0]);
    if (first) setCursor({ y: first.y, m: first.m });
  }, [dates]);

  const cells = useMemo(() => {
    if (!cursor) return [];
    const firstWeekday = new Date(cursor.y, cursor.m - 1, 1).getDay();
    const daysInMonth = new Date(cursor.y, cursor.m, 0).getDate();
    const list = [];

    for (let i = 0; i < firstWeekday; i += 1) list.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) list.push({ y: cursor.y, m: cursor.m, d });
    return list;
  }, [cursor]);

  const shiftMonth = (delta) => {
    setCursor((prev) => {
      if (!prev) return prev;
      const next = new Date(prev.y, prev.m - 1 + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() + 1 };
    });
  };

  const monthLabel = cursor
    ? new Date(cursor.y, cursor.m - 1, 1).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
    : '';

  return (
    <div
      className={styles.calOverlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={styles.calModal} role="dialog" aria-modal="true" aria-labelledby="immersion-calendar-title">
        <div className={styles.calHeader}>
          <div className={styles.calIdentity}>
            <span className={styles.calHeaderIcon} aria-hidden="true">
              <CalendarDays size={20} strokeWidth={2} />
            </span>
            <div>
              <span className={styles.calEyebrow}>Immersion Schedule</span>
              <h2 id="immersion-calendar-title">{title || 'Batch Schedule'}</h2>
              <p>
                {batchLabel ? `${batchLabel} · ` : ''}
                {dates.length} immersion day{dates.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <button type="button" className={styles.calClose} onClick={onClose} aria-label="Close calendar">
            <X size={18} />
          </button>
        </div>

        <div className={styles.calToolbar}>
          <button type="button" className={styles.calNav} onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <span className={styles.calMonth}>{monthLabel}</span>
          <button type="button" className={styles.calNav} onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className={styles.calBody}>
          <div className={styles.calWeekdays}>
            {WEEKDAYS.map((day) => (
              <span key={day} className={styles.calWeekday}>{day}</span>
            ))}
          </div>

          <div className={styles.calGrid}>
            {cells.map((cell, index) => {
              if (!cell) {
                return <span key={`pad-${index}`} className={styles.calCell} />;
              }
              const iso = toISO(cell);
              const isDay = attendanceDays.has(iso);
              const weekday = new Date(cell.y, cell.m - 1, cell.d).getDay();
              const isWeekend = weekday === 0 || weekday === 6;
              const classes = [
                styles.calCell,
                isDay ? styles.calCellActive : '',
                !isDay && isWeekend ? styles.calCellWeekend : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <span key={iso} className={classes} title={isDay ? 'Immersion day' : undefined}>
                  <span className={styles.calCellDay}>{cell.d}</span>
                  {isDay && <span className={styles.calCellDot} />}
                </span>
              );
            })}
          </div>

          {dates.length === 0 && (
            <p className={styles.calEmpty}>No immersion schedule has been set for this batch yet.</p>
          )}
        </div>

        <div className={styles.calFooter}>
          <span className={styles.calLegendItem}>
            <span className={styles.calLegendSwatch} />
            Immersion day
          </span>
          <span className={styles.calLegendItem}>
            <span className={`${styles.calLegendSwatch} ${styles.calLegendMuted}`} />
            Not scheduled
          </span>
          <button type="button" className={styles.calDone} onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}

export default ImmersionScheduleCalendar;
