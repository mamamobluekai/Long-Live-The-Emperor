import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import {
  getStudentAttendanceStatus,
  studentCheckIn,
  studentCheckOut,
  submitAppeal,
  getMyAppeals,
  getMySchedule,
} from '../../../api/attendanceApi';
import styles from './Attendance.module.css';

const TZ_LABEL = 'Asia/Manila';

function nowPartsInTz(tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date());
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  let h = parseInt(map.hour, 10) % 24;
  let m = parseInt(map.minute, 10);
  let s = parseInt(map.second, 10);
  return { h, m, s };
}

// seconds until the next HH:MM target (today, in tz)
function secondsUntil(targetH, targetM, tz) {
  const { h, m, s } = nowPartsInTz(tz);
  const nowMin = h * 60 + m;
  const targetMin = targetH * 60 + targetM;
  let diff = targetMin - nowMin;
  if (diff < 0) diff += 24 * 60;
  return diff * 60 - s;
}

function fmtCountdown(sec) {
  sec = Math.max(0, Math.floor(sec));
  const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
  const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatTime12(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatTimeFromDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getDayStatus(day, todayDate, attendanceRecord, open, timedIn, timedOut, canTimeIn, canTimeOut) {
  const rec = attendanceRecord;
  if (day.date === todayDate) {
    if (timedOut) return 'present';
    if (timedIn) return 'checked_in';
    if (canTimeIn) return 'can_time_in';
    if (canTimeOut) return 'can_time_out';
    if (open) return 'open';
    return 'closed';
  }
  if (day.date < todayDate) {
    if (rec && (rec.check_in_time || rec.status === 'absent')) {
      return rec.status === 'absent' ? 'absent' : 'present';
    }
    return 'absent';
  }
  return 'scheduled';
}

function formatDateLabel(dateStr) {
  let date;
  if (dateStr instanceof Date) {
    date = dateStr;
  } else {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    date = new Date(y, m - 1, d);
  }
  if (isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildScheduleDays(schedules) {
  const days = [];
  const seen = new Set();
  for (const scheduleItem of schedules) {
    const dates = scheduleItem.attendance_dates ? scheduleItem.attendance_dates.split(',').filter(Boolean) : [];
    let scheduleDayNumber = 0;
    dates.forEach((date) => {
      if (seen.has(date)) return;
      seen.add(date);
      scheduleDayNumber++;
      days.push({
        key: date,
        dayNumber: scheduleDayNumber,
        date,
        batchLabel: scheduleItem.batch_label,
        supervisorName: scheduleItem.supervisor_first_name && scheduleItem.supervisor_last_name
          ? `${scheduleItem.supervisor_first_name} ${scheduleItem.supervisor_last_name}`
          : 'Batch',
      });
    });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
  });
}

function Attendance() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(null);
  const [today, setToday] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [nowSec, setNowSec] = useState(0);

  const [schedules, setSchedules] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [attendanceMap, setAttendanceMap] = useState({});

  // Appeals
  const [appeals, setAppeals] = useState([]);
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealType, setAppealType] = useState('time_in');
  const [appealDate, setAppealDate] = useState('');
  const [appealExcuse, setAppealExcuse] = useState('');
  const [appealFile, setAppealFile] = useState(null);
  const [appealSubmitting, setAppealSubmitting] = useState(false);

  const watchIdRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [status, mine] = await Promise.all([
        getStudentAttendanceStatus(token),
        getMyAppeals(token),
      ]);
      setAccess(status);
      setAppeals(mine.appeals || []);
      setToday(status?.today || null);
    } catch (err) {
      console.error('refresh failed', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    const tick = setInterval(() => setNowSec((s) => (s + 1) % 86400), 1000);
    return () => { clearInterval(id); clearInterval(tick); };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    async function loadSchedule() {
      try {
        const data = await getMySchedule(token);
        if (!cancelled) {
          setSchedules(data.schedules || []);
          setAttendanceMap(data.attendanceMap || {});
        }
      } catch {
        // ignore schedule load error
      } finally {
        if (!cancelled) setScheduleLoading(false);
      }
    }
    loadSchedule();
    return () => { cancelled = true; };
  }, [token]);

  const flash = (type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 5000);
  };

  const doCheckIn = async () => {
    setBusy(true);
    try {
      const pos = await getCurrentPosition();
      const { latitude, longitude, accuracy } = pos.coords;
      await studentCheckIn(latitude, longitude, accuracy, token);
      flash('success', 'Timed in successfully! Your location is now shared.');
      startWatch();
      refresh();
    } catch (err) {
      const msg = err.response?.data?.message || 'Could not time in. Make sure location is enabled.';
      flash('error', msg);
    } finally {
      setBusy(false);
    }
  };

  const doCheckOut = async () => {
    setBusy(true);
    try {
      let lat, lng, acc;
      try {
        const pos = await getCurrentPosition();
        lat = pos.coords.latitude; lng = pos.coords.longitude; acc = pos.coords.accuracy;
      } catch { /* best effort */ }
      await studentCheckOut(lat, lng, acc, token);
      flash('success', 'Timed out successfully. Location sharing stopped.');
      stopWatch();
      refresh();
    } catch (err) {
      flash('error', err.response?.data?.message || 'Could not time out.');
    } finally {
      setBusy(false);
    }
  };

  const startWatch = () => {
    if (!token || watchIdRef.current !== null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/tracking/location/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
          });
        } catch { /* ignore */ }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  };

  const stopWatch = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  useEffect(() => () => stopWatch(), []);

  // Derived UI state
  const assigned = access?.assigned;
  const tz = access?.timezone || TZ_LABEL;
  const phase = access?.phase;
  const open = access?.attendance_open === true;
  const activeType = access?.active_type;
  const manualOpen = access?.manual_open === true;
  const schedule = access?.schedule;

  const todayRec = today;
  const timedIn = !!todayRec?.check_in_time;
  const timedOut = !!todayRec?.check_out_time;
  const inSchedule = access?.in_schedule === true;
  const todayDate = access?.date;
  const scheduleDays = buildScheduleDays(schedules);
  const canTimeIn = inSchedule && !timedIn && open && (manualOpen || activeType === 'time_in');
  const canTimeOut = inSchedule && timedIn && !timedOut && open && (manualOpen || activeType === 'time_out');

  // Countdown target
  let countdownTarget = null;
  let countdownLabel = '';
  if (assigned && access) {
    if (phase === 'before_in') {
      const [h, m] = schedule.time_in.open.split(':').map(Number);
      countdownTarget = secondsUntil(h, m, tz);
      countdownLabel = 'Time In opens in';
    } else if (phase === 'in_open') {
      const [h, m] = schedule.time_in.close.split(':').map(Number);
      countdownTarget = secondsUntil(h, m, tz);
      countdownLabel = 'Time In closes in';
    } else if (phase === 'in_closed') {
      const [h, m] = schedule.time_out.open.split(':').map(Number);
      countdownTarget = secondsUntil(h, m, tz);
      countdownLabel = 'Time Out opens in';
    } else if (phase === 'out_open') {
      const [h, m] = schedule.time_out.close.split(':').map(Number);
      countdownTarget = secondsUntil(h, m, tz);
      countdownLabel = 'Time Out closes in';
    } else if (phase === 'out_closed') {
      countdownLabel = 'Attendance for today is closed';
    }
  }

  const submitAppealForm = async (e) => {
    e.preventDefault();
    if (!appealExcuse.trim()) { flash('error', 'Please provide an excuse.'); return; }
    setAppealSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('attendance_type', appealType);
      if (appealDate) fd.append('appeal_date', appealDate);
      fd.append('excuse', appealExcuse.trim());
      if (appealFile) fd.append('file', appealFile);
      await submitAppeal(fd, token);
      flash('success', 'Appeal submitted to your teacher.');
      setShowAppealForm(false);
      setAppealDate('');
      setAppealExcuse('');
      setAppealFile(null);
      refresh();
    } catch (err) {
      flash('error', err.response?.data?.message || 'Failed to submit appeal.');
    } finally {
      setAppealSubmitting(false);
    }
  };

  const phaseMessage = () => {
    if (!assigned) return 'You are not assigned to a teacher batch yet.';
    if (!inSchedule) return 'Select your scheduled day below to time in, time out, or appeal.';
    if (manualOpen) return 'Your teacher has opened attendance manually.';
    switch (phase) {
      case 'before_in': return 'Attendance has not opened yet.';
      case 'in_open': return 'Time In is now open — you can time in.';
      case 'in_closed': return 'Time In is closed. You can submit an appeal or wait for Time Out.';
      case 'out_open': return 'Time Out is now open — you can time out.';
      case 'out_closed': return 'Attendance for today is closed.';
      default: return '';
    }
  };

  const openAppeal = (type, date = todayDate) => {
    setAppealType(type);
    setAppealDate(date || '');
    setShowAppealForm(true);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h2 className={styles.title}>Daily Attendance</h2>
        <p className={styles.subtitle}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          {' · '}{tz}
        </p>

        {notice && (
          <div className={`${styles.notice} ${notice.type === 'success' ? styles.noticeSuccess : notice.type === 'error' ? styles.noticeError : styles.noticeInfo}`}>
            {notice.text}
          </div>
        )}

        {loading && <p className={styles.info}>Loading status...</p>}

        {!loading && assigned && (
          <>
            {inSchedule && (
              <div className={styles.statusRow}>
                <span className={`${styles.phasePill} ${open ? styles.phaseOpen : styles.phaseClosed}`}>
                  {open ? 'Open' : 'Closed'}
                </span>
                <span className={styles.phaseText}>{phaseMessage()}</span>
              </div>
            )}

            {inSchedule && countdownLabel && countdownTarget !== null && (
              <div className={styles.countdown} key={nowSec}>
                <span className={styles.countdownLabel}>{countdownLabel}</span>
                <span className={styles.countdownValue}>{fmtCountdown(countdownTarget)}</span>
              </div>
            )}
            {inSchedule && countdownLabel && countdownTarget === null && (
              <p className={styles.info}>{countdownLabel}</p>
            )}

            {/* IMMERSION SCHEDULE */}
            {!scheduleLoading && schedules.length > 0 && (
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>My Schedule</h3>
                <div className={styles.dayList}>
                  {scheduleDays.map((day) => {
                    const isToday = day.date === todayDate;
                    const rec = attendanceMap[day.date] || null;
                    const dayStatus = getDayStatus(day, todayDate, rec, open, timedIn, timedOut, canTimeIn, canTimeOut);
                    const inTime = rec ? formatTimeFromDate(rec.check_in_time) : null;
                    const outTime = rec ? formatTimeFromDate(rec.check_out_time) : null;
                    const inWindow = schedule ? `${formatTime12(schedule.time_in.open)} – ${formatTime12(schedule.time_in.close)}` : '';
                    const outWindow = schedule ? `${formatTime12(schedule.time_out.open)} – ${formatTime12(schedule.time_out.close)}` : '';

                    const statusLabel = () => {
                      switch (dayStatus) {
                        case 'present': return 'Present';
                        case 'absent': return 'Absent';
                        case 'checked_in': return 'Checked In';
                        case 'can_time_in': return 'Can Time In';
                        case 'can_time_out': return 'Can Time Out';
                        case 'open': return 'Open Today';
                        case 'closed': return 'Closed Today';
                        case 'scheduled': return 'Scheduled';
                        default: return '';
                      }
                    };

                    return (
                      <div key={day.key} className={`${styles.dayCard} ${isToday ? styles.dayToday : ''}`}>
                        <div className={styles.dayMain}>
                          <span className={styles.dayNumber}>Day {day.dayNumber}</span>
                          <span className={styles.dayDate}>{formatDateLabel(day.date)}</span>
                          <span className={styles.dayMeta}>{day.batchLabel} · {day.supervisorName}</span>
                          {inWindow && <span className={styles.dayTime}>Time In: {inWindow}</span>}
                          {outWindow && <span className={styles.dayTime}>Time Out: {outWindow}</span>}
                          {inTime && <span className={styles.dayTimeActual}>In: {inTime}</span>}
                          {outTime && <span className={styles.dayTimeActual}>Out: {outTime}</span>}
                        </div>
                        <div className={styles.dayActions}>
                          <span className={`${styles.dayStatus} ${dayStatus === 'present' || dayStatus === 'checked_in' ? styles.dayOpen : dayStatus === 'absent' ? styles.dayAbsent : ''}`}>
                            {statusLabel()}
                          </span>
                          {isToday && dayStatus === 'can_time_in' && (
                            <button className={styles.smallPrimaryBtn} onClick={doCheckIn} disabled={busy}>
                              Time In
                            </button>
                          )}
                          {isToday && dayStatus === 'can_time_out' && (
                            <button className={styles.smallSecondaryBtn} onClick={doCheckOut} disabled={busy}>
                              Time Out
                            </button>
                          )}
                          {(dayStatus === 'absent' || dayStatus === 'closed') && (
                            <button className={styles.appealLink} onClick={() => openAppeal(dayStatus === 'absent' ? 'time_in' : 'time_in', day.date)}>
                              Appeal
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {schedules.map((s) => {
                  const dates = s.attendance_dates ? s.attendance_dates.split(',') : [];
                  return (
                    <div key={s.id} className={styles.scheduleCard}>
                      <div className={styles.scheduleHeader}>
                        <div>
                          <strong>Supervisor:</strong> {s.supervisor_first_name && s.supervisor_last_name ? `${s.supervisor_first_name} ${s.supervisor_last_name}` : 'Batch'}
                        </div>
                        <div>
                          <strong>Duration:</strong> {s.duration_value} {s.duration_type} ({dates.length} days)
                        </div>
                        <div>
                          <strong>Start:</strong> {s.start_date} → <strong>End:</strong> {s.end_date}
                        </div>
                      </div>
                      <div className={styles.dateChips}>
                        {dates.map((d) => (
                          <span key={d} className={styles.dateChip}>{d}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TIME IN */}
            <div className={`${styles.section} ${styles.legacyActionSection}`}>
              <h3 className={styles.sectionTitle}>Time In</h3>
              {timedIn ? (
                <div className={styles.doneRow}>
                  <span className={styles.check}>✓</span>
                  Timed in at {new Date(todayRec.check_in_time).toLocaleTimeString()}
                </div>
              ) : !inSchedule ? (
                <div className={styles.lockedRow}>
                  <p className={styles.info}>Today is not a scheduled immersion date.</p>
                </div>
              ) : canTimeIn ? (
                <button className={styles.primaryBtn} onClick={doCheckIn} disabled={busy}>
                  {busy ? 'Working…' : 'Time In'}
                </button>
              ) : (
                <div className={styles.lockedRow}>
                  <p className={styles.info}>Time In is not available right now.</p>
                  <button className={styles.appealLink} onClick={() => { setAppealType('time_in'); setShowAppealForm(true); }}>
                    Submit an appeal
                  </button>
                </div>
              )}
            </div>

            {/* TIME OUT */}
            <div className={`${styles.section} ${styles.legacyActionSection}`}>
              <h3 className={styles.sectionTitle}>Time Out</h3>
              {timedOut ? (
                <div className={styles.doneRow}>
                  <span className={styles.check}>✓</span>
                  Timed out at {new Date(todayRec.check_out_time).toLocaleTimeString()}
                </div>
              ) : !inSchedule ? (
                <div className={styles.lockedRow}>
                  <p className={styles.info}>Today is not a scheduled immersion date.</p>
                </div>
              ) : canTimeOut ? (
                <button className={styles.secondaryBtn} onClick={doCheckOut} disabled={busy}>
                  {busy ? 'Working…' : 'Time Out'}
                </button>
              ) : timedIn ? (
                <div className={styles.lockedRow}>
                  <p className={styles.info}>Time Out is not available right now.</p>
                  <button className={styles.appealLink} onClick={() => { setAppealType('time_out'); setShowAppealForm(true); }}>
                    Submit an appeal
                  </button>
                </div>
              ) : (
                <p className={styles.info}>Time out after you have timed in.</p>
              )}
            </div>

            {/* APPEAL FORM (inline) */}
            {showAppealForm && (
              <div className={styles.appealSection}>
                <h3 className={styles.sectionTitle}>Submit Appeal</h3>
                <form className={styles.appealForm} onSubmit={submitAppealForm}>
                  {appealDate && (
                    <div className={styles.appealDate}>
                      Appeal for {formatDateLabel(appealDate)}
                    </div>
                  )}
                  <label className={styles.field}>
                    Type
                    <select value={appealType} onChange={(e) => setAppealType(e.target.value)}>
                      <option value="time_in">Time In</option>
                      <option value="time_out">Time Out</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    Reason for missing attendance
                    <textarea value={appealExcuse} onChange={(e) => setAppealExcuse(e.target.value)} rows={3} placeholder="Explain why you missed the window…" />
                  </label>
                  <label className={styles.field}>
                    Attachment (image / PDF, optional)
                    <input type="file" accept="image/*,application/pdf" onChange={(e) => setAppealFile(e.target.files[0])} />
                  </label>
                  <div className={styles.appealActions}>
                    <button type="submit" className={styles.primaryBtn} disabled={appealSubmitting}>
                      {appealSubmitting ? 'Submitting…' : 'Submit Appeal'}
                    </button>
                    <button type="button" className={styles.cancelBtn} onClick={() => setShowAppealForm(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            {/* EXISTING APPEALS (compact list) */}
            {appeals.length > 0 && (
              <div className={styles.appealSection}>
                <h3 className={styles.sectionTitle}>My Appeals</h3>
                <ul className={styles.appealList}>
                  {appeals.map((a) => (
                    <li key={a.id} className={styles.appealItem}>
                      <div className={styles.appealTop}>
                        <strong>{a.attendance_type === 'time_in' ? 'Time In' : 'Time Out'}</strong>
                        <span className={`${styles.badge} ${styles['badge_' + a.status]}`}>{a.status}</span>
                      </div>
                      {a.appeal_date && <p className={styles.appealExcuse}>For {formatDateLabel(String(a.appeal_date).slice(0, 10))}</p>}
                      <p className={styles.appealExcuse}>{a.excuse}</p>
                      {a.file_url && <a className={styles.fileLink} href={a.file_url} target="_blank" rel="noreferrer">View attachment</a>}
                      {a.teacher_comment && <p className={styles.comment}>Teacher: {a.teacher_comment}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {!loading && !assigned && (
          <p className={styles.info}>You are not assigned to a teacher batch yet. Contact your coordinator.</p>
        )}
      </div>
    </div>
  );
}

export default Attendance;
