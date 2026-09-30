import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getSupervisorBatches,
  getSupervisorBatchStatus,
  getSupervisorBatchConfig,
  updateSupervisorBatchConfig,
  getSupervisorBatchSchedules,
  upsertSupervisorBatchSchedule,
  getSupervisorBlockedDates,
  addSupervisorBlockedDate,
  removeSupervisorBlockedDate,
} from '../../../api/supervisorApi';
import { Ban, CalendarClock, Check, Info, Pencil, Save, Undo2, X } from 'lucide-react';
import Feedback from '../../../components/Feedback';
import SupervisorDatePicker from './SupervisorDatePicker';
import styles from './SupervisorSchedule.module.css';

function normalizeTime(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function timeToMinutes(value) {
  const [h, m] = String(value).split(':').map(Number);
  return h * 60 + m;
}

// Mirrors validateWindows() on the server so the supervisor gets the reason
// immediately instead of a generic failure after the round trip. The previous
// form stored whatever was typed, and a partial edit (e.g. Time In 19:30 left
// with the 08:30 default as its close) saved fine but resolved to a day where
// students could only time out -- the hours looked like they were never set.
function validateWindows(cfg) {
  const inOpen = timeToMinutes(cfg.time_in_open);
  const inClose = timeToMinutes(cfg.time_in_close);
  const outOpen = timeToMinutes(cfg.time_out_open);
  const outClose = timeToMinutes(cfg.time_out_close);

  if (![inOpen, inClose, outOpen, outClose].every(Number.isFinite)) {
    return 'Fill in all four attendance times.';
  }
  if (inOpen === inClose) {
    return 'Time In Open and Time In Close cannot be the same. Give students a window, e.g. 19:30 to 20:00.';
  }
  if (outOpen === outClose) {
    return 'Time Out Open and Time Out Close cannot be the same. Give students a window, e.g. 23:00 to 23:30.';
  }
  if (inClose > outOpen) {
    return 'The Time In window must close before the Time Out window opens.';
  }
  return null;
}

// "2026-09-28" -> "Sep 28, 2026". Parsed manually so the string is never
// shifted a day by the browser's timezone.
function formatShortDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso || '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

function normalizeDate(value) {  if (!value) return '';
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (str.includes('T')) return str.substring(0, 10);
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// The supervisor owns attendance scheduling: time-in/out windows, the work
// immersion duration, and manual open/close — for every teacher batch linked
// to them. (Deployment-request batches are scheduled through their linked
// teacher batch.)
function SupervisorSchedule() {
  const [batches, setBatches] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Each card is locked until its own Edit button is pressed, so a saved
  // schedule can't be edited (or re-saved) by accident. Pressing Edit unlocks
  // the fields and reveals the Save button; a successful save re-locks the card.
  const [windowsEditing, setWindowsEditing] = useState(false);
  const [editingGroups, setEditingGroups] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [blockedDates, setBlockedDates] = useState([]);
  const [allBlocked, setAllBlocked] = useState([]);
  const [holidays, setHolidays] = useState([]);
  // Which group's blocks are being managed: a specific supervisor's group, or
  // 'batch' for the whole batch. One supervisor's event must not knock out an
  // immersion day for every other supervisor in the same batch.
  const [blockScope, setBlockScope] = useState('batch');
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [pendingBlock, setPendingBlock] = useState({ date: '', reason: '' });
  const [blocking, setBlocking] = useState(false);
  const noticeTimer = useRef(null);

  // Maps for the calendar: 'YYYY-MM-DD' -> human label.
  const blockedMap = useMemo(() => {
    const map = {};
    for (const b of blockedDates) map[b.date] = b.reason || 'Blocked';
    return map;
  }, [blockedDates]);

  const holidayMap = useMemo(() => {
    const map = {};
    for (const h of holidays) map[h.date] = h.name;
    return map;
  }, [holidays]);

  // Per-group blocked map for each group's calendar: batch-wide blocks (no
  // supervisor_id) plus that group's own. A block for one supervisor must not
  // show up on another supervisor's calendar.
  const blockedMapByGroup = useMemo(() => {
    const map = {};
    for (const b of allBlocked) {
      const key = String(b.supervisor_id ?? 'batch');
      if (!map[key]) map[key] = {};
      map[key][b.date] = b.reason || 'Blocked';
    }
    return map;
  }, [allBlocked]);

  const blockedForGroup = (group) => {
    const key = String(group?.supervisor_id ?? 'batch');
    return { ...(blockedMapByGroup.batch || {}), ...(blockedMapByGroup[key] || {}) };
  };

  // Name the group a blocked date belongs to, so a mixed list is readable.
  const scopeNameFor = (supervisorId) => {
    if (supervisorId == null) return 'Everyone in this batch';
    const match = groups.find((g) => Number(g.supervisor_id) === Number(supervisorId));
    return match?.supervisor_name || `Supervisor ${supervisorId}`;
  };

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoadingBatches(true);
      setError('');
      try {
        const res = await getSupervisorBatches();
        // Only teacher batches carry attendance config/schedules.
        const teacherBatches = (res.batches || []).filter((b) => b.source === 'teacher');
        if (cancelled) return;
        setBatches(teacherBatches);
        setSelectedId(teacherBatches.length ? teacherBatches[0].request_id : null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoadingBatches(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [s, c, g, bd] = await Promise.all([
          getSupervisorBatchStatus(selectedId),
          getSupervisorBatchConfig(selectedId),
          getSupervisorBatchSchedules(selectedId),
          getSupervisorBlockedDates(selectedId).catch(() => ({ blocked_dates: [], holidays: [] })),
        ]);
        if (cancelled) return;
        setStatus(s);
        setConfig({
          time_in_open: normalizeTime(c.time_in_open),
          time_in_close: normalizeTime(c.time_in_close),
          time_out_open: normalizeTime(c.time_out_open),
          time_out_close: normalizeTime(c.time_out_close),
          timezone: c.timezone,
        });
        setGroups(g.groups || []);
        setBlockedDates(bd.blocked_dates || []);
        setHolidays(bd.holidays || []);
        setWindowsEditing(false);
        setEditingGroups({});
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedId]);

  // Edit unlocks the fields and swaps the button to Save.
  const startEditWindows = () => {
    setWindowsEditing(true);
    setError('');
    setNotice('');
  };

  const startEditGroup = (group) => {
    const key = group.supervisor_id || 'batch';
    setEditingGroups((g) => ({ ...g, [key]: true }));
    setError('');
    setNotice('');
  };

  const editWindow = (field, value) => {
    setConfig((c) => ({ ...c, [field]: value }));
  };

  const editGroupStart = (group, startDate) => {
    const key = group.supervisor_id || 'batch';
    setGroups((gs) =>
      gs.map((g) =>
        (g.supervisor_id || 'batch') === key
          ? { ...g, schedule: { ...(g.schedule || {}), start_date: startDate } }
          : g
      )
    );
  };

  // Re-arming the timer on each flash stops an earlier timer from cutting a
  // newer message short.
  const flash = (text) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 4000);
  };

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const saveWindows = async () => {
    if (!selectedId || !config) return;
    if (!windowsEditing) return;

    const problem = validateWindows(config);
    if (problem) {
      setError(problem);
      setNotice('');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const updated = await updateSupervisorBatchConfig(selectedId, {
        time_in_open: config.time_in_open,
        time_in_close: config.time_in_close,
        time_out_open: config.time_out_open,
        time_out_close: config.time_out_close,
      });
      setConfig({
        time_in_open: normalizeTime(updated.time_in_open),
        time_in_close: normalizeTime(updated.time_in_close),
        time_out_open: normalizeTime(updated.time_out_open),
        time_out_close: normalizeTime(updated.time_out_close),
        timezone: updated.timezone,
      });
      const s = await getSupervisorBatchStatus(selectedId);
      setStatus(s);
      setWindowsEditing(false);
      flash('Attendance windows saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveDuration = async (group, startDate) => {
    if (!selectedId) return;
    const key = group.supervisor_id || 'batch';
    if (!editingGroups[key]) return;
    setSaving(true);
    setError('');
    try {
      await upsertSupervisorBatchSchedule(selectedId, {
        supervisor_id: group.supervisor_id,
        duration_type: 'days',
        duration_value: 10,
        start_date: startDate,
      });
      const g = await getSupervisorBatchSchedules(selectedId);
      setGroups(g.groups || []);
      setEditingGroups((d) => ({ ...d, [key]: false }));
      flash('Immersion schedule saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const refreshExclusions = async (scope = blockScope) => {
    if (!selectedId) return;
    // One 'all' request feeds both the per-group calendars and the scope list.
    const all = await getSupervisorBlockedDates(selectedId, 'all').catch(() => null);
    if (all) {
      setAllBlocked(all.blocked_dates || []);
      setHolidays(all.holidays || []);
    }

    const scoped =
      scope === 'batch'
        ? { blocked_dates: (all?.blocked_dates || []).filter((b) => b.supervisor_id == null) }
        : await getSupervisorBlockedDates(selectedId, scope).catch(() => null);

    if (scoped) {
      setBlockedDates(scoped.blocked_dates || []);
    }
  };

  // Reload the blocked list whenever the managed scope changes, and default to
  // the first group rather than the whole batch.
  useEffect(() => {
    const firstGroup = groups[0];
    if (!firstGroup) return;
    const firstKey = firstGroup.supervisor_id || 'batch';
    setBlockScope((current) => (current === 'batch' ? firstKey : current));
  }, [groups]);

  // Escape closes the block modal, and the body must not scroll behind it.
  useEffect(() => {
    if (!blockModalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setBlockModalOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [blockModalOpen]);

  useEffect(() => {
    if (!selectedId) return;
    refreshExclusions(blockScope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, blockScope]);

  const blockDate = async (e) => {
    e.preventDefault();
    if (!selectedId) return;
    const date = pendingBlock.date;
    if (!date) {
      setError('Pick a date to block.');
      return;
    }
    setBlocking(true);
    setError('');
    try {
      await addSupervisorBlockedDate(selectedId, {
        date,
        reason: pendingBlock.reason || null,
        // 'batch' => supervisor_id null (whole batch); otherwise this group only.
        supervisor_id: blockScope === 'batch' ? null : Number(blockScope),
      });
      setPendingBlock({ date: '', reason: '' });
      setBlockModalOpen(false);
      await refreshExclusions(blockScope);
      flash('Date blocked. It no longer counts as an immersion day.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBlocking(false);
    }
  };

  const unblockDate = async (id) => {
    setBlocking(true);
    setError('');
    try {
      await removeSupervisorBlockedDate(id);
      await refreshExclusions(blockScope);
      flash('Date unblocked.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBlocking(false);
    }
  };

  const selectedBatch = batches.find((b) => Number(b.request_id) === Number(selectedId));

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.headerIcon}>
          <CalendarClock size={24} />
        </div>
        <div>
          <h1>Attendance Schedule</h1>
          <p>Set attendance windows and immersion duration for your batches. Teachers see these as read-only.</p>
        </div>
      </div>

      {error && <Feedback type="error" message={error} onClose={() => setError('')} />}

      {notice && (
        <div className={styles.toast} role="status">
          <span className={styles.toastIcon} aria-hidden="true">
            <Check size={16} />
          </span>
          <span className={styles.toastBody}>{notice}</span>
          <button
            type="button"
            className={styles.toastClose}
            aria-label="Dismiss"
            onClick={() => setNotice('')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loadingBatches ? (
        <div className={styles.loadingPanel}>
          <span className={styles.spinner} />
          Loading batches...
        </div>
      ) : batches.length === 0 ? (
        <div className={styles.empty}>No teacher batches linked to you yet.</div>
      ) : loading ? (
        <div className={styles.loadingPanel}>
          <span className={styles.spinner} />
          Loading schedule...
        </div>
      ) : (
        <div className={styles.splitRow}>
          <div className={styles.splitCol}>
          {config && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>
                    Attendance Windows{config.timezone ? ` (${config.timezone})` : ''}
                  </h2>
                  <p>
                    {selectedBatch ? selectedBatch.batch_label : 'Attendance windows for this batch'}
                  </p>
                </div>
                <div className={styles.headerActions}>
                  <span
                    className={`${styles.badge} ${
                      status?.attendance_open ? styles.badgeOpen : styles.badgeClosed
                    }`}
                  >
                    {status?.attendance_open ? 'Open' : 'Closed'}
                  </span>
                </div>
              </div>

              <div className={styles.cardBody}>
                <form id="windows-form" onSubmit={saveWindows} className={styles.scheduleForm}>
                  <label>
                    Time In Open
                    <input
                      type="time"
                      value={config.time_in_open || ''}
                      onChange={(e) => editWindow('time_in_open', e.target.value)}
                      readOnly={!windowsEditing}
                      required
                    />
                  </label>
                  <label>
                    Time In Close
                    <input
                      type="time"
                      value={config.time_in_close || ''}
                      onChange={(e) => editWindow('time_in_close', e.target.value)}
                      readOnly={!windowsEditing}
                      required
                    />
                  </label>
                  <label>
                    Time Out Open
                    <input
                      type="time"
                      value={config.time_out_open || ''}
                      onChange={(e) => editWindow('time_out_open', e.target.value)}
                      readOnly={!windowsEditing}
                      required
                    />
                  </label>
                  <label>
                    Time Out Close
                    <input
                      type="time"
                      value={config.time_out_close || ''}
                      onChange={(e) => editWindow('time_out_close', e.target.value)}
                      readOnly={!windowsEditing}
                      required
                    />
                  </label>
                </form>

                <p className={styles.hint}>
                  <Info size={15} />
                  <span>
                    All four times are required, and they must run in order: Time In opens first,
                    then Time In closes, then Time Out opens, and Time Out closes last. Fill in all
                    four — leaving one blank keeps an old value that can quietly break the window.
                    Attendance then runs on its own: students can only sign in and out inside these
                    hours. Example for a 7:30 PM to 11:30 PM shift — Time In Open 07:30 PM, Time In
                    Close 08:00 PM, Time Out Open 11:00 PM, Time Out Close 11:30 PM.
                  </span>
                </p>

                <div className={styles.formActions}>
                  {windowsEditing ? (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={saving}
                      onClick={saveWindows}
                    >
                      <Save size={15} />
                      {saving ? 'Saving...' : 'Save Windows'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={startEditWindows}
                    >
                      <Pencil size={15} />
                      Edit
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}

          </div>

          <div className={styles.splitCol}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2>Work Immersion Duration</h2>
                <p>10 days, weekdays only.</p>
              </div>
            </div>

            <div className={styles.cardBody}>
              {groups.length === 0 ? (
                <div className={styles.empty}>No students in this batch yet.</div>
              ) : (
                <div className={styles.groupList}>
                  {groups.map((group) => {
                    const schedule = group.schedule || {};
                    const start = normalizeDate(schedule.start_date) || normalizeDate(new Date());
                    const groupKey = group.supervisor_id || 'batch';
                    const isEditing = !!editingGroups[groupKey];
                    return (
                      <div key={groupKey} className={styles.groupCard}>
                        <div className={styles.groupHeader}>
                          <strong>{group.supervisor_name || 'Batch Students'}</strong>
                          <div className={styles.groupMeta}>
                            <span className={styles.tag}>
                              {group.students.length} student{group.students.length !== 1 ? 's' : ''}
                            </span>
                            <span
                              className={`${styles.badge} ${
                                schedule.id ? styles.badgeActive : styles.badgeNone
                              }`}
                            >
                              {schedule.id ? 'Schedule active' : 'No schedule yet'}
                            </span>
                          </div>
                        </div>
                        <div className={styles.scheduleForm}>
                          <div className={styles.dateField}>
                            <span className={styles.dateLabel}>Start Date</span>
                            <SupervisorDatePicker
                              value={start}
                              disabled={!isEditing}
                              ariaLabel={`Start date for ${group.supervisor_name || 'batch students'}`}
                              blockedDates={blockedForGroup(group)}
                              holidays={holidayMap}
                              onChange={(iso) => editGroupStart(group, iso)}
                            />
                          </div>
                          <div className={styles.formActions}>
                            {isEditing ? (
                              <button
                                type="button"
                                className={styles.primaryButton}
                                disabled={saving}
                                onClick={() => saveDuration(group, start)}
                              >
                                <Save size={15} />
                                {saving ? 'Saving...' : schedule.id ? 'Update Schedule' : 'Save Schedule'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() => startEditGroup(group)}
                              >
                                <Pencil size={15} />
                                Edit
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
          </div>
        </div>
      )}

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Blocked Dates</h2>
            <p>Days that do not count as immersion, even on a weekday.</p>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.tag}>{blockedDates.length} blocked</span>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                setPendingBlock({ date: '', reason: '' });
                setBlockModalOpen(true);
              }}
            >
              <Ban size={15} />
              Block Date
            </button>
          </div>
        </div>

        <div className={styles.cardBody}>
          <p className={styles.hint}>
            <Info size={15} />
            <span>
              Weekends and Philippine holidays are skipped automatically. Use this for anything
              else that stops immersion, such as a school event, a training day, or a campus
              closure. A blocked date is also refused as an appeal date and cannot be used for
              check-in.
            </span>
          </p>

          {blockedDates.length === 0 ? (
            <div className={styles.empty}>No dates blocked for this selection yet.</div>
          ) : (
            <ul className={styles.blockList}>
              {blockedDates.map((b) => (
                <li key={b.id} className={styles.blockItem}>
                  <div className={styles.blockInfo}>
                    <strong>{formatShortDate(b.date)}</strong>
                    <span className={styles.muted}>
                      {b.scope === 'batch' ? 'Everyone in this batch' : scopeNameFor(b.supervisor_id)}
                      {' \u00b7 '}
                      {b.reason || 'No reason given'}
                      {holidayMap[b.date] ? ` \u00b7 also a holiday (${holidayMap[b.date]})` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={blocking}
                    onClick={() => unblockDate(b.id)}
                  >
                    <Undo2 size={15} />
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          )}

          {holidays.length ? (
            <details className={styles.holidayDetails}>
              <summary>Philippine holidays on record ({holidays.length})</summary>
              <ul className={styles.holidayList}>
                {holidays.map((h) => (
                  <li key={h.date}>
                    <span>{formatShortDate(h.date)}</span>
                    <span className={styles.muted}>
                      {h.name}
                      {h.is_regular ? ' \u00b7 regular' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </section>

      {blockModalOpen ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setBlockModalOpen(false);
          }}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-date-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setBlockModalOpen(false);
            }}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderIcon} aria-hidden="true">
                <Ban size={20} />
              </div>
              <div>
                <h3 id="block-date-title">Block Date</h3>
                <p>Stop a date from counting as an immersion day.</p>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                aria-label="Close"
                onClick={() => setBlockModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={blockDate} className={styles.modalBody}>
              <label className={styles.scopeField}>
                <span className={styles.dateLabel}>Applies to</span>
                <select
                  className={styles.scopeSelect}
                  value={blockScope}
                  onChange={(e) =>
                    setBlockScope(e.target.value === 'batch' ? 'batch' : e.target.value)
                  }
                >
                  {groups.map((g) => {
                    const key = String(g.supervisor_id || 'batch');
                    return (
                      <option key={key} value={key}>
                        {g.supervisor_name || 'Batch Students'} only
                      </option>
                    );
                  })}
                  <option value="batch">Everyone in this batch</option>
                </select>
              </label>

              <p className={styles.scopeNote}>
                {blockScope === 'batch'
                  ? 'Blocking for everyone affects every supervisor in this batch. Prefer a single group when only one has an event.'
                  : `Only ${
                      groups.find((g) => String(g.supervisor_id || 'batch') === String(blockScope))
                        ?.supervisor_name || 'this group'
                    } loses that day. Other groups in the batch are unaffected.`}
              </p>

              <div className={styles.dateField}>
                <span className={styles.dateLabel}>Date to block</span>
                <SupervisorDatePicker
                  value={pendingBlock.date}
                  ariaLabel="Date to block"
                  blockedDates={blockedMap}
                  holidays={holidayMap}
                  onChange={(iso) => setPendingBlock((p) => ({ ...p, date: iso }))}
                />
              </div>

              <label className={styles.reasonField}>
                <span className={styles.dateLabel}>Reason (optional)</span>
                <input
                  type="text"
                  value={pendingBlock.reason}
                  maxLength={200}
                  placeholder="e.g. School foundation day"
                  onChange={(e) => setPendingBlock((p) => ({ ...p, reason: e.target.value }))}
                />
              </label>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setBlockModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.primaryButton} disabled={blocking}>
                  <Ban size={15} />
                  {blocking ? 'Saving...' : 'Block Date'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SupervisorSchedule;