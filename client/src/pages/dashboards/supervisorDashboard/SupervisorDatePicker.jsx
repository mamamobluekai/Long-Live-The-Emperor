import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import styles from './SupervisorDatePicker.module.css';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const POPOVER_WIDTH = 322;
const GAP = 8;

function parseDate(value) {
  if (!value) return null;
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isWeekendIso(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getDay() === 0 || d.getDay() === 6;
}

function isSameDay(a, b) {
  return (
    a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function startOfMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  // Monday-first: shift so the grid starts on the Monday on or before the 1st.
  const offset = (first.getDay() + 6) % 7;
  return new Date(year, month, 1 - offset);
}

// A custom calendar in the RequirementsReview maroon design system. The native
// <input type="date"> picker cannot be styled, so this replaces it to get a
// larger, legible calendar with bigger touch targets.
//
// `blockedDates` (YYYY-MM-DD -> reason) and `holidays` (YYYY-MM-DD -> name) let
// a supervisor see up front which days will NOT count as immersion days, and
// which are already blocked, before picking a start date.
export default function SupervisorDatePicker({
  id,
  value,
  onChange,
  disabled = false,
  ariaLabel,
  blockedDates = {},
  holidays = {},
  extraBlockedDates = {},
}) {
  const selected = parseDate(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() =>
    selected ? new Date(selected.getFullYear(), selected.getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  // The card clips its content (overflow: hidden) to round the accent bar, so
  // the popover is portalled to <body> and positioned against the viewport.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const height = popRef.current ? popRef.current.offsetHeight : 320;
      const below = window.innerHeight - r.bottom;
      const flip = below < height + GAP + 8 && r.top > below;
      let left = r.left;
      if (left + POPOVER_WIDTH > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - POPOVER_WIDTH - 8);
      }
      setPos({
        left,
        top: flip ? Math.max(8, r.top - height - GAP) : r.bottom + GAP,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, view]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      const inWrap = wrapRef.current && wrapRef.current.contains(e.target);
      const inPop = popRef.current && popRef.current.contains(e.target);
      if (!inWrap && !inPop) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      if (triggerRef.current) triggerRef.current.focus();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const days = useMemo(() => {
    const start = startOfMonthGrid(view.getFullYear(), view.getMonth());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return {
        date: d,
        inMonth: d.getMonth() === view.getMonth(),
        iso: toISO(d),
      };
    });
  }, [view]);

  const shiftMonth = (delta) => {
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  };

  const pick = (iso) => {
    onChange(iso);
    setOpen(false);
    if (triggerRef.current) triggerRef.current.focus();
  };

  const today = new Date();

  const allBlocked = { ...extraBlockedDates, ...blockedDates };
  const isHoliday = (iso) => Object.prototype.hasOwnProperty.call(holidays, iso);
  const isBlocked = (iso) => Object.prototype.hasOwnProperty.call(allBlocked, iso);

  // Only show the legend for what is actually relevant this month, so the
  // popover stays quiet for a normal schedule.
  const monthHas = (fn) => days.some((d) => fn(d.iso));
  const legendItems = [
    monthHas(isHoliday) ? { label: 'Holiday', swatch: styles.legendHoliday } : null,
    monthHas(isBlocked) ? { label: 'Blocked', swatch: styles.legendBlocked } : null,
    monthHas((iso) => isWeekendIso(iso)) ? { label: 'Weekend', swatch: styles.legendWeekend } : null,
  ].filter(Boolean);

  return (
    <div className={styles.wrapper} ref={wrapRef}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''} ${!value ? styles.triggerEmpty : ''}`}
        onClick={() => {
          if (disabled) return;
          if (!open) {
            const base = selected || new Date();
            setView(new Date(base.getFullYear(), base.getMonth(), 1));
          }
          setOpen((o) => !o);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
      >
        <CalendarDays size={16} className={styles.triggerIcon} />
        <span className={styles.triggerText}>
          {selected
            ? selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Select a date'}
        </span>
        {value ? (
          <span
            className={styles.clearBtn}
            role="button"
            tabIndex={-1}
            aria-label="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
          >
            <X size={14} />
          </span>
        ) : null}
      </button>

      {open
        ? createPortal(
            <div
              ref={popRef}
              className={styles.popover}
              style={pos ? { top: `${pos.top}px`, left: `${pos.left}px` } : { top: -9999, left: -9999, visibility: 'hidden' }}
              role="dialog"
              aria-label={ariaLabel || 'Choose a date'}
            >
          <div className={styles.header}>
            <button type="button" className={styles.navBtn} onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <div className={styles.headerLabel}>
              {view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <button type="button" className={styles.navBtn} onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className={styles.weekdays}>
            {WEEKDAYS.map((w) => (
              <span key={w} className={styles.weekday}>
                {w}
              </span>
            ))}
          </div>

          <div className={styles.grid}>
            {days.map(({ date, inMonth, iso }) => {
              const isSelected = isSameDay(date, selected);
              const isToday = isSameDay(date, today);
              const holiday = isHoliday(iso);
              const blocked = isBlocked(iso);
              const note = blocked ? allBlocked[iso] : holiday ? holidays[iso] : null;
              const cls = [
                styles.day,
                inMonth ? '' : styles.dayOutside,
                isSelected ? styles.daySelected : '',
                isToday ? styles.dayToday : '',
                holiday ? styles.dayHoliday : '',
                blocked ? styles.dayBlocked : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={iso}
                  type="button"
                  className={cls}
                  onClick={() => pick(iso)}
                  title={note ? `${note}${holiday && blocked ? ' (holiday, already blocked)' : ''}` : undefined}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isSelected}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          {legendItems.length ? (
            <div className={styles.legend}>
              {legendItems.map((item) => (
                <span key={item.label} className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${item.swatch}`} aria-hidden="true" />
                  {item.label}
                </span>
              ))}
            </div>
          ) : null}

          <div className={styles.footer}>
            <button type="button" className={styles.footBtn} onClick={() => pick(toISO(today))}>
              Today
            </button>
            <span className={styles.selectedLabel}>
              {selected
                ? selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                : 'No date selected'}
            </span>
          </div>
            </div>,
          document.body
        )
        : null}
    </div>
  );
}
