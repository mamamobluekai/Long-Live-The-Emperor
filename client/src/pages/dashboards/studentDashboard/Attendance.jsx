import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import {
  getStudentAttendanceStatus,
  studentCheckIn,
  studentCheckOut,
  submitAppeal,
  getMyAppeals,
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
  const [notice, setNotice] = useState(null); // { type: 'success'|'error'|'info', text }
  const [nowSec, setNowSec] = useState(0);

  // Appeals
  const [appeals, setAppeals] = useState([]);
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealType, setAppealType] = useState('time_in');
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
      fd.append('excuse', appealExcuse.trim());
      if (appealFile) fd.append('file', appealFile);
      await submitAppeal(fd, token);
      flash('success', 'Appeal submitted to your teacher.');
      setShowAppealForm(false);
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
            <div className={styles.statusRow}>
              <span className={`${styles.phasePill} ${open ? styles.phaseOpen : styles.phaseClosed}`}>
                {open ? 'Open' : 'Closed'}
              </span>
              <span className={styles.phaseText}>{phaseMessage()}</span>
            </div>

            {countdownLabel && countdownTarget !== null && (
              <div className={styles.countdown} key={nowSec}>
                <span className={styles.countdownLabel}>{countdownLabel}</span>
                <span className={styles.countdownValue}>{fmtCountdown(countdownTarget)}</span>
              </div>
            )}
            {countdownLabel && countdownTarget === null && (
              <p className={styles.info}>{countdownLabel}</p>
            )}

            {/* TIME IN */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Time In</h3>
              {timedIn ? (
                <div className={styles.doneRow}>
                  <span className={styles.check}>✓</span>
                  Timed in at {new Date(todayRec.check_in_time).toLocaleTimeString()}
                </div>
              ) : activeType === 'time_in' && open ? (
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
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Time Out</h3>
              {timedOut ? (
                <div className={styles.doneRow}>
                  <span className={styles.check}>✓</span>
                  Timed out at {new Date(todayRec.check_out_time).toLocaleTimeString()}
                </div>
              ) : timedIn && activeType === 'time_out' && open ? (
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

            {/* APPEALS */}
            <div className={styles.section}>
              <div className={styles.appealHeader}>
                <h3 className={styles.sectionTitle}>My Appeals</h3>
                {!showAppealForm && (
                  <button className={styles.appealLink} onClick={() => setShowAppealForm(true)}>New Appeal</button>
                )}
              </div>

              {showAppealForm && (
                <form className={styles.appealForm} onSubmit={submitAppealForm}>
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
              )}

              <ul className={styles.appealList}>
                {appeals.length === 0 && <li className={styles.appealEmpty}>No appeals yet.</li>}
                {appeals.map((a) => (
                  <li key={a.id} className={styles.appealItem}>
                    <div className={styles.appealTop}>
                      <strong>{a.attendance_type === 'time_in' ? 'Time In' : 'Time Out'}</strong>
                      <span className={`${styles.badge} ${styles['badge_' + a.status]}`}>{a.status}</span>
                    </div>
                    <p className={styles.appealExcuse}>{a.excuse}</p>
                    {a.file_url && <a className={styles.fileLink} href={a.file_url} target="_blank" rel="noreferrer">View attachment</a>}
                    {a.teacher_comment && <p className={styles.comment}>Teacher: {a.teacher_comment}</p>}
                  </li>
                ))}
              </ul>
            </div>
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
