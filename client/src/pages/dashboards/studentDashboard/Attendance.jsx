import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import {
  getStudentAttendanceStatus,
  studentCheckIn,
  studentCheckOut,
  submitAppeal,
  getMyAppeals,
  getMySchedule,
  getMyAttendanceRecords,
  deleteMyAppeal,
} from '../../../api/attendanceApi';
import {
  getMyDailyDocs,
} from '../../../api/fileApi';
import styles from './Attendance.module.css';

const TZ_LABEL = 'Asia/Manila';

function nowPartsInTz(tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());

  const map = {};

  for (const p of parts) {
    map[p.type] = p.value;
  }

  let h = parseInt(map.hour, 10) % 24;
  let m = parseInt(map.minute, 10);
  let s = parseInt(map.second, 10);

  return { h, m, s };
}

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

  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function normalizeDateKey(dateValue) {
  if (typeof dateValue === 'string') {
    // FIX:
    // If backend returns an ISO datetime such as
    // 2026-08-28T00:00:00.000Z,
    // only use the YYYY-MM-DD portion.
    if (dateValue.includes('T')) {
      return dateValue.substring(0, 10);
    }

    // If already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }

    // Handle strings such as:
    // 2026-08-28 00:00:00
    if (dateValue.length >= 10) {
      const possibleDate = dateValue.substring(0, 10);

      if (/^\d{4}-\d{2}-\d{2}$/.test(possibleDate)) {
        return possibleDate;
      }
    }

    return dateValue;
  }

  if (dateValue instanceof Date) {
    const y = dateValue.getUTCFullYear();
    const m = String(dateValue.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateValue.getUTCDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
  }

  if (
    dateValue &&
    typeof dateValue === 'object' &&
    dateValue.year
  ) {
    return `${dateValue.year}-${String(
      dateValue.month || 1
    ).padStart(2, '0')}-${String(
      dateValue.day || 1
    ).padStart(2, '0')}`;
  }

  if (!dateValue) return dateValue;

  const parsed = new Date(dateValue);

  if (!isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
  }

  return String(dateValue);
}

function getDayStatus(
  day,
  todayDate,
  attendanceRecord,
  open,
  timedIn,
  timedOut,
  canTimeIn,
  canTimeOut
) {
  const rec = attendanceRecord;

  if (day.date === todayDate) {
    if (timedOut) return 'present';
    if (timedIn) return 'checked_in';
    if (canTimeIn) return 'can_time_in';
    if (canTimeOut) return 'can_time_out';
    if (open) return 'open';

    // The attendance window has fully elapsed and the student never clocked
    // in or out. Today is now a missed day, so report it as an absence
    // instead of a bare "Closed" so the student understands they can appeal.
    if (rec && rec.status === 'present') return 'present';

    return 'absent';
  }

  if (day.date < todayDate) {
    // A past day is only "present" when the student actually clocked in
    // and clocked out (or the teacher marked the day present). Every other
    // outcome — no record at all, a marked absence, a check-in with no
    // check-out — is an absence the student must be able to appeal.
    const clockedIn = !!(rec && (rec.check_in_time || rec.status === 'present'));
    const clockedOut = !!(rec && rec.check_out_time);

    if (clockedIn && clockedOut) return 'present';
    if (rec && rec.status === 'present') return 'present';

    return 'absent';
  }

  // A future day is not yet appealable.
  return 'scheduled';
}

// A day is appealable when the student did not complete it: a missing
// Time In, a missing Time Out, or an explicit absence mark. Each appeal is
// only offered for the event that is actually missing, so a student who
// already clocked in is not asked to appeal their (recorded) time in.
//
// Future days are never appealable. For a PAST day both windows have already
// closed, so either appeal is fine. For TODAY each appeal waits until its own
// window has closed: appealing a Time Out at 9:00 AM, four hours before the
// Time Out window even opens, was possible before and made no sense.
//
// Note: the server stores status 'checked_in' / 'checked_out' for real
// clock-ins, and 'present' only when a teacher resolved the day (including
// an approved appeal). All three mean "a time in exists".
function getAppealTargets(day, todayDate, attendanceRecord, windows = {}) {
  if (!day || !todayDate) return [];

  // Future days are not appealable.
  if (day.date > todayDate) return [];

  const rec = attendanceRecord || null;

  // The teacher already resolved this day: either the student completed it,
  // or a previous appeal was approved and the server flipped the day to
  // 'present'. Either way there is nothing left to dispute.
  if (rec && rec.status === 'present') return [];

  const timedIn = !!(rec && (rec.check_in_time || rec.status === 'present'));
  const timedOut = !!(rec && rec.check_out_time);

  // A day with both events recorded has nothing to dispute.
  if (timedIn && timedOut) return [];

  const isToday = day.date === todayDate;
  const timeInClosed = isToday ? windows.timeInClosed !== false : true;
  const timeOutClosed = isToday ? windows.timeOutClosed !== false : true;

  const targets = [];
  // Only offer the Time In appeal when no time in was recorded at all, and
  // only once today's Time In window has closed.
  if (!timedIn && timeInClosed) targets.push('time_in');
  // A recorded time in with no time out is appealable on the out side only.
  if (timedIn && !timedOut && timeOutClosed) targets.push('time_out');
  // A student marked absent with neither event recorded is missing both. The
  // Time Out side is only offered once that window has closed.
  if (!timedIn && !timedOut && timeOutClosed) targets.push('time_out');

  return targets;
}

// Has this window's closing time already passed, in the batch's timezone?
// Defaults to false so a missing/malformed config hides the appeal rather than
// offering one that the server will reject.
function windowHasClosed(closeTime, tz) {
  const m = String(closeTime || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return false;
  const closeMin = Number(m[1]) * 60 + Number(m[2]);
  const { h, m: mm } = nowPartsInTz(tz);
  return h * 60 + mm >= closeMin;
}

// True when an appeal already exists for this day and attendance type, so
// the dashboard can show a per-type "already appealed" state instead of
// letting the student queue a duplicate. Time In and Time Out appeals are
// tracked separately: appealing the time in does not block the time out.
//
// The stored `appeal_date` is authoritative: the server validates it against
// the student's immersion schedule and rejects anything outside it, so an
// appeal filed from a given day card is always stored against that same day.
// That is what keeps this match reliable and stops a filed appeal from
// reappearing as an available button.
function hasAppealFor(appeals, date, type) {
  if (!Array.isArray(appeals) || !date) return false;

  const dayKey = normalizeDateKey(date);

  return appeals.some((appeal) => {
    if (!appeal) return false;
    if (type && appeal.attendance_type !== type) return false;
    if (!appeal.appeal_date) return false;

    return normalizeDateKey(appeal.appeal_date) === dayKey;
  });
}

function formatDateLabel(dateStr) {
  if (!dateStr) return 'Invalid Date';

  const normalized = normalizeDateKey(dateStr);
  const [year, month, day] = normalized.split('-');

  if (!year || !month || !day) {
    return 'Invalid Date';
  }

  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day)
    )
  );

  const weekday = date.toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });

  const monthName = date.toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });

  return `${weekday}, ${monthName} ${Number(day)}, ${year}`;
}

function buildScheduleDays(schedules) {
  const days = [];
  const seen = new Set();

  for (const scheduleItem of schedules) {
    const dates = scheduleItem.attendance_dates
      ? scheduleItem.attendance_dates
          .split(',')
          .filter(Boolean)
      : [];

    let scheduleDayNumber = 0;

    dates.forEach((date) => {
      if (seen.has(date)) return;

      seen.add(date);
      scheduleDayNumber++;

      days.push({
        key: date,
        dayNumber: scheduleDayNumber,
        date,
        batchId: scheduleItem.teacher_batch_id,
        batchLabel: scheduleItem.batch_label,
        supervisorName:
          scheduleItem.supervisor_first_name &&
          scheduleItem.supervisor_last_name
            ? `${scheduleItem.supervisor_first_name} ${scheduleItem.supervisor_last_name}`
            : 'Batch',
      });
    });
  }

  return days.sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error('unsupported'));
    }

    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  });
}


function TrashIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
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
  const [scheduleLoading, setScheduleLoading] =
    useState(true);

  const [attendanceMap, setAttendanceMap] =
    useState({});


  // Appeals
  const [appeals, setAppeals] = useState([]);
  const [showAppealForm, setShowAppealForm] =
    useState(false);
  const [showAppealHistory, setShowAppealHistory] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);
  const [clearingAppeals, setClearingAppeals] = useState(false);
  // Styled confirmation, replacing the browser confirm() dialog.
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [appealType, setAppealType] =
    useState('time_in');

  const [appealDate, setAppealDate] =
    useState('');

  const [appealExcuse, setAppealExcuse] =
    useState('');

  const [appealFile, setAppealFile] =
    useState(null);

  const [appealSubmitting, setAppealSubmitting] =
    useState(false);

  const [deletingAppealId, setDeletingAppealId] =
    useState(null);

  const watchIdRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [status, mine, records] = await Promise.all([
        getStudentAttendanceStatus(token),
        getMyAppeals(token),
        getMyAttendanceRecords(token),
      ]);

      setAccess(status);
      setAppeals(mine.appeals || []);
      setToday(status?.today || null);

      const recMap = {};
      (records.records || []).forEach((r) => {
        recMap[normalizeDateKey(r.date)] = r;
      });
      setAttendanceMap(recMap);
    } catch (err) {
      console.error('refresh failed', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  /*
   * ============================================================
   * DOCUMENT LOADING
   * ============================================================
   *
   * FIX:
   * Documents are now stored using a normalized YYYY-MM-DD key.
   *
   * This prevents:
   *
   * 2026-08-28
   *
   * from being different from:
   *
   * 2026-08-28T00:00:00.000Z
   *
   * or:
   *
   * 2026-08-28 00:00:00
   */
  const loadDocs = useCallback(async (batchId) => {
    if (!batchId) return;

    try {
      const result = await getMyDailyDocs({
        batchId,
      });

      console.log(
        '[DEBUG DOC] loadDocs result:',
        result
      );

      // eslint-disable-next-line no-undef
      setDocMap((prev) => {
        const newMap = { ...prev };

        (result.docs || []).forEach((d) => {
          const key = normalizeDateKey(
            d.date ||
              d.document_date ||
              d.attendance_date
          );

          if (key) {
            newMap[key] = d;

            console.log(
              '[DEBUG DOC] Stored document:',
              {
                key,
                id: d.id,
                date: d.date,
                status: d.status,
                file_id: d.file_id,
                original_name:
                  d.original_name,
              }
            );
          }
        });

        console.log(
          '[DEBUG DOC] Final docMap:',
          newMap
        );

        return newMap;
      });
    } catch (err) {
      console.error('loadDocs error:', err);
    }
  }, []);

  useEffect(() => {
    refresh();

    const id = setInterval(
      refresh,
      15000
    );

    const tick = setInterval(() => {
      setNowSec(
        (s) => (s + 1) % 86400
      );
    }, 1000);

    return () => {
      clearInterval(id);
      clearInterval(tick);
    };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;

    async function loadSchedule() {
      try {
        const [scheduleData, recordsData] = await Promise.all([
          getMySchedule(token),
          getMyAttendanceRecords(token),
        ]);

        if (!cancelled) {
          setSchedules(scheduleData.schedules || []);

          const recMap = {};
          (recordsData.records || []).forEach((r) => {
            recMap[normalizeDateKey(r.date)] = r;
          });
          setAttendanceMap(recMap);

          const batchIds = [
            ...new Set(
              (scheduleData.schedules || [])
                .map((s) => s.teacher_batch_id)
                .filter(Boolean)
            ),
          ];

          for (const bid of batchIds) {
            loadDocs(bid).catch(
              (err) => console.error('loadDocs failed:', err)
            );
          }
        }
      } catch {
        // ignore schedule load error
      } finally {
        if (!cancelled) {
          setScheduleLoading(false);
        }
      }
    }

    loadSchedule();

    return () => {
      cancelled = true;
    };
  }, [token, loadDocs]);

  const refreshDocs = useCallback(async () => {
    if (!schedules.length) return;

    const batchIds = [
      ...new Set(
        schedules
          .map(
            (s) =>
              s.teacher_batch_id
          )
          .filter(Boolean)
      ),
    ];

    for (const bid of batchIds) {
      await loadDocs(bid).catch(
        (err) =>
          console.error(
            'refreshDocs failed:',
            err
          )
      );
    }
  }, [schedules, loadDocs]);

  useEffect(() => {
    if (!refreshDocs) return;

    const id = setInterval(
      refreshDocs,
      15000
    );

    return () => clearInterval(id);
  }, [refreshDocs]);

  const flash = (type, text) => {
    setNotice({
      type,
      text,
    });

    setTimeout(
      () => setNotice(null),
      5000
    );
  };

  const doCheckIn = async () => {
    setBusy(true);

    try {
      const pos =
        await getCurrentPosition();

      const {
        latitude,
        longitude,
        accuracy,
      } = pos.coords;

      await studentCheckIn(
        latitude,
        longitude,
        accuracy,
        token
      );

      flash(
        'success',
        'Timed in successfully! Your location is now shared.'
      );

      startWatch();
      refresh();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        'Could not time in. Make sure location is enabled.';

      flash('error', msg);
    } finally {
      setBusy(false);
    }
  };

  const doCheckOut = async () => {
    setBusy(true);

    try {
      let lat;
      let lng;
      let acc;

      try {
        const pos =
          await getCurrentPosition();

        lat =
          pos.coords.latitude;

        lng =
          pos.coords.longitude;

        acc =
          pos.coords.accuracy;
      } catch {
        // best effort
      }

      await studentCheckOut(
        lat,
        lng,
        acc,
        token
      );

      flash(
        'success',
        'Timed out successfully. Location sharing stopped.'
      );

      stopWatch();
      refresh();
    } catch (err) {
      flash(
        'error',
        err.response?.data?.message ||
          'Could not time out.'
      );
    } finally {
      setBusy(false);
    }
  };

  const startWatch = () => {
    if (
      !token ||
      watchIdRef.current !== null
    ) {
      return;
    }

    watchIdRef.current =
      navigator.geolocation.watchPosition(
        async (pos) => {
          try {
            await fetch(
              `${
                import.meta.env.VITE_API_URL ||
                'http://localhost:5000/api'
              }/tracking/location/update`,
              {
                method: 'POST',
                headers: {
                  'Content-Type':
                    'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  latitude:
                    pos.coords.latitude,
                  longitude:
                    pos.coords.longitude,
                  accuracy:
                    pos.coords.accuracy,
                }),
              }
            );
          } catch {
            // ignore
          }
        },
        () => {},
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000,
        }
      );
  };

  const stopWatch = () => {
    if (
      watchIdRef.current !== null
    ) {
      navigator.geolocation.clearWatch(
        watchIdRef.current
      );

      watchIdRef.current = null;
    }
  };

  useEffect(
    () => () => stopWatch(),
    []
  );

  // Derived UI state
  const assigned = access?.assigned;
  const tz =
    access?.timezone ||
    TZ_LABEL;

  const phase = access?.phase;
  const open =
    access?.attendance_open === true;

  const activeType =
    access?.active_type;

  const manualOpen =
    access?.manual_open === true;

  const schedule =
    access?.schedule;

  const todayRec = today;

  const timedIn =
    !!todayRec?.check_in_time;

  const timedOut =
    !!todayRec?.check_out_time;

  const inSchedule =
    access?.in_schedule === true;

  const todayDate =
    access?.date;

  const scheduleDays =
    buildScheduleDays(schedules);

  const canTimeIn =
    inSchedule &&
    !timedIn &&
    open &&
    (manualOpen ||
      activeType === 'time_in');

  const canTimeOut =
    inSchedule &&
    timedIn &&
    !timedOut &&
    open &&
    (manualOpen ||
      activeType === 'time_out');

  // An appeal may only be filed once the window it disputes has actually
  // closed, so a student cannot appeal a Time Out hours before the window
  // opens, nor while it is still running.
  const appealWindows = {
    timeInClosed: windowHasClosed(schedule?.time_in?.close, access?.timezone),
    timeOutClosed: windowHasClosed(schedule?.time_out?.close, access?.timezone),
  };

  const appealWindowHint = (type) => {
    if (type === 'time_in' && !appealWindows.timeInClosed) {
      return `Available after the Time In window closes (${formatTime12(schedule?.time_in?.close)}).`;
    }
    if (type === 'time_out' && !appealWindows.timeOutClosed) {
      return `Available after the Time Out window closes (${formatTime12(schedule?.time_out?.close)}).`;
    }
    return null;
  };

  // Countdown target
  let countdownTarget = null;
  let countdownLabel = '';

  if (assigned && access) {
    if (phase === 'before_in') {
      const [h, m] =
        schedule.time_in.open
          .split(':')
          .map(Number);

      countdownTarget =
        secondsUntil(
          h,
          m,
          tz
        );

      countdownLabel =
        'Time In opens in';
    } else if (
      phase === 'in_open'
    ) {
      const [h, m] =
        schedule.time_in.close
          .split(':')
          .map(Number);

      countdownTarget =
        secondsUntil(
          h,
          m,
          tz
        );

      countdownLabel =
        'Time In closes in';
    } else if (
      phase === 'in_closed'
    ) {
      const [h, m] =
        schedule.time_out.open
          .split(':')
          .map(Number);

      countdownTarget =
        secondsUntil(
          h,
          m,
          tz
        );

      countdownLabel =
        'Time Out opens in';
    } else if (
      phase === 'out_open'
    ) {
      const [h, m] =
        schedule.time_out.close
          .split(':')
          .map(Number);

      countdownTarget =
        secondsUntil(
          h,
          m,
          tz
        );

      countdownLabel =
        'Time Out closes in';
    }
    // phase === 'out_closed' deliberately sets no label and no target, so
    // the header shows just the Closed pill with no trailing message.
  }

  const submitAppealForm =
    async (e) => {
      e.preventDefault();

      if (!appealExcuse.trim()) {
        flash(
          'error',
          'Please provide an excuse.'
        );

        return;
      }

      setAppealSubmitting(true);

      try {
        const fd =
          new FormData();

        fd.append(
          'attendance_type',
          appealType
        );

        if (appealDate) {
          fd.append(
            'appeal_date',
            appealDate
          );
        }

        fd.append(
          'excuse',
          appealExcuse.trim()
        );

        if (appealFile) {
          fd.append(
            'file',
            appealFile
          );
        }

        await submitAppeal(
          fd,
          token
        );

        flash(
          'success',
          'Appeal submitted to your teacher.'
        );

        setShowAppealForm(false);
        setAppealDate('');
        setAppealExcuse('');
        setAppealFile(null);

        refresh();
      } catch (err) {
        // A 409 means the server already has this appeal for the same day and
        // type, even though the button was still showing one. That happens when
        // local state drifted (stale tab, or an appeal filed before the day's
        // date was stored correctly). Re-sync immediately so the button flips to
        // the "already appeal" state instead of offering a duplicate that can
        // never succeed.
        if (err.response?.status === 409) {
          flash(
            'info',
            err.response?.data?.message ||
              'This appeal was already submitted.'
          );

          setShowAppealForm(false);
          setAppealDate('');
          setAppealExcuse('');
          setAppealFile(null);

          await refresh();

          return;
        }

        flash(
          'error',
          err.response?.data
            ?.message ||
            'Failed to submit appeal.'
        );
      } finally {
        setAppealSubmitting(
          false
        );
      }
    };
  const handleDeleteAppeal =
    async (appealId) => {
      if (!appealId) return;
      setDeletingAppealId(appealId);
      try {
        await deleteMyAppeal(appealId, token);
        setAppeals((currentAppeals) =>
          currentAppeals.filter((appeal) => appeal.id !== appealId)
        );
        flash('success', 'Appeal deleted.');
      } catch (err) {
        flash(
          'error',
          err.response?.data?.message ||
            'Failed to delete appeal.'
        );
      } finally {
        setDeletingAppealId(null);
      }
    };

  // Removes every appeal at once, oldest-and-newest alike, so the history
  // drawer can be cleared in a single action.
  const handleDeleteAllAppeals = async () => {
    if (!appeals.length || clearingAppeals) return;

    setClearingAppeals(true);
    const targets = appeals.map((a) => a.id);
    const failed = [];
    for (const id of targets) {
      try {
        await deleteMyAppeal(id, token);
      } catch {
        failed.push(id);
      }
    }
    setAppeals((current) => current.filter((a) => !failed.includes(a.id)));
    setClearingAppeals(false);

    if (failed.length) {
      flash(
        'error',
        `Could not delete ${failed.length} appeal${failed.length !== 1 ? 's' : ''}. Please try again.`
      );
    } else {
      flash('success', 'All appeals deleted.');
    }
  };

  const closeDeleteConfirm = () => {
    if (deletingAppealId || clearingAppeals) return;
    setDeleteConfirm(null);
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'all') handleDeleteAllAppeals();
    else handleDeleteAppeal(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const phaseMessage = () => {
    if (!assigned) {
      return 'You are not assigned to a teacher batch yet.';
    }

    if (!inSchedule) {
      return 'Select your scheduled day below to time in, time out, or appeal.';
    }

    if (manualOpen) {
      return 'Your teacher has opened attendance manually.';
    }

    switch (phase) {
      case 'before_in':
        return 'Attendance has not opened yet.';

      case 'in_open':
        return 'Time In is now open — you can time in.';

      case 'in_closed':
        return 'Time In is closed. You can submit an appeal or wait for Time Out.';

      case 'out_open':
        return 'Time Out is now open — you can time out.';

      case 'out_closed':
        return '';

      default:
        return '';
    }
  };

  // Empty for phases that carry no message (e.g. once attendance for the day
  // is closed), so the header renders just the Open/Closed pill.
  const phaseText = inSchedule
    ? phaseMessage()
    : '';

const openAppeal = (
    type,
    date = todayDate
  ) => {
    setAppealType(type);
    setAppealDate(
      date || ''
    );
    setShowAppealForm(true);
  };







  return (
    <div className={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700;800&display=swap');
      `}</style>

      <div className={styles.pageHeader}>
        <div className={styles.headerMain}>
          <div className={styles.eyebrow}>Student Portal</div>
          <h2 className={styles.title}>Daily Attendance</h2>
          <p className={styles.subtitle}>
            Time in and out for your scheduled immersion days.
          </p>
        </div>

        {inSchedule && (
          <div className={styles.headerStatus}>
            <span
              className={`${styles.phasePill} ${
                open ? styles.phaseOpen : styles.phaseClosed
              }`}
            >
              {open ? 'Open' : 'Closed'}
            </span>
            {phaseText && (
              <span className={styles.headerStatusText}>{phaseText}</span>
            )}
          </div>
        )}

        {inSchedule && countdownLabel && countdownTarget !== null && (
          <div className={styles.headerCountdown} key={nowSec}>
            <span className={styles.headerCountdownLabel}>{countdownLabel}</span>
            <span className={styles.headerCountdownValue}>{fmtCountdown(countdownTarget)}</span>
          </div>
        )}
      </div>

      <div className={styles.card}>

        {notice && (
          <div
            className={`${styles.notice} ${
              notice.type === 'success'
                ? styles.noticeSuccess
                : notice.type === 'error'
                  ? styles.noticeError
                  : styles.noticeInfo
            }`}
          >
            {notice.text}
          </div>
        )}

        {loading && (
          <p className={styles.info}>
            Loading status...
          </p>
        )}

        {!loading && assigned && (
          <>
            {inSchedule &&
              countdownLabel &&
              countdownTarget ===
                null && (
                <p
                  className={
                    styles.info
                  }
                >
                  {countdownLabel}
                </p>
              )}

            {/* Daily Documentation now lives in its own sidebar page. */}

            {/* TIME IN */}

            <div
              className={`${styles.section} ${styles.legacyActionSection}`}
            >

              <h3
                className={
                  styles.sectionTitle
                }
              >
                Time In
              </h3>

              {timedIn ? (
                <div
                  className={
                    styles.doneRow
                  }
                >
                  <span
                    className={
                      styles.check
                    }
                  >
                    ✓
                  </span>

                  Timed in at{' '}
                  {new Date(
                    todayRec.check_in_time
                  ).toLocaleTimeString()}
                </div>
              ) : !inSchedule ? (
                <div
                  className={
                    styles.lockedRow
                  }
                >
                  <p
                    className={
                      styles.info
                    }
                  >
                    Today is not a scheduled immersion date.
                  </p>
                </div>
              ) : canTimeIn ? (
                <button
                  className={
                    styles.primaryBtn
                  }
                  onClick={
                    doCheckIn
                  }
                  disabled={
                    busy
                  }
                >
                  {busy
                    ? 'Working…'
                    : 'Time In'}
                </button>
              ) : (
                <div
                  className={
                    styles.lockedRow
                  }
                >
                  <p
                    className={
                      styles.info
                    }
                  >
                    Time In is not available right now.
                  </p>

                  <button
                    className={
                      styles.appealLink
                    }
                    onClick={() => openAppeal('time_in', todayDate)}
                  >
                    Submit an appeal
                  </button>
                </div>
              )}

            </div>

            {/* TIME OUT */}

            <div
              className={`${styles.section} ${styles.legacyActionSection}`}
            >

              <h3
                className={
                  styles.sectionTitle
                }
              >
                Time Out
              </h3>

              {timedOut ? (
                <div
                  className={
                    styles.doneRow
                  }
                >
                  <span
                    className={
                      styles.check
                    }
                  >
                    ✓
                  </span>

                  Timed out at{' '}
                  {new Date(
                    todayRec.check_out_time
                  ).toLocaleTimeString()}
                </div>
              ) : !inSchedule ? (
                <div
                  className={
                    styles.lockedRow
                  }
                >
                  <p
                    className={
                      styles.info
                    }
                  >
                    Today is not a scheduled immersion date.
                  </p>
                </div>
              ) : canTimeOut ? (
                <button
                  className={
                    styles.secondaryBtn
                  }
                  onClick={
                    doCheckOut
                  }
                  disabled={
                    busy
                  }
                >
                  {busy
                    ? 'Working…'
                    : 'Time Out'}
                </button>
              ) : timedIn ? (
                <div
                  className={
                    styles.lockedRow
                  }
                >
                  <p
                    className={
                      styles.info
                    }
                  >
                    Time Out is not available right now.
                  </p>

                  <button
                    className={
                      styles.appealLink
                    }
                    onClick={() => openAppeal('time_out', todayDate)}
                  >
                    Submit an appeal
                  </button>
                </div>
              ) : (
                <p
                  className={
                    styles.info
                  }
                >
                  Time out after you have timed in.
                </p>
              )}

            </div>

            {/* SCHEDULE — Day 1, Day 2, ... with per-day actions */}

            {!scheduleLoading &&
              scheduleDays.length > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionHeaderRow}>
                    <div>
                      <h3 className={styles.sectionTitle}>
                        My Schedule ({scheduleDays.length} day{scheduleDays.length !== 1 ? 's' : ''})
                      </h3>
                      <p className={styles.sectionSubtitle}>
                        Your immersion days, windows and recorded times.
                      </p>
                    </div>
                  </div>

                  <div className={styles.dayListHeader} aria-hidden="true">
                    <span>Day</span>
                    <span>Batch / Supervisor</span>
                    <span>Attendance Time</span>
                    <span>Recorded</span>
                    <span>Status</span>
                    <span />
                  </div>

                  <div className={styles.dayList}>
                    {scheduleDays.map((day) => {
                      const dayKey = normalizeDateKey(day.date);
                      const rec = attendanceMap[dayKey] || null;
                      const dayStatus = getDayStatus(
                        day,
                        todayDate,
                        rec,
                        open,
                        timedIn,
                        timedOut,
                        canTimeIn,
                        canTimeOut
                      );
                      const isToday = day.date === todayDate;
                      // Appealable when the day was not completed. Both Time In
                      // and Time Out appeals are offered so the student picks
                      // which event they are disputing. This no longer requires
                      // an attendance row to exist, so a student the teacher
                      // never scanned can still appeal the day they were marked
                      // absent for.
                      const appealTargets = getAppealTargets(day, todayDate, rec, appealWindows);
                      const canAppeal = appealTargets.length > 0;
                      // Tracked per type so filing a Time In appeal does not
                      // hide the Time Out appeal for the same day.
                      const appealTimeInSent = hasAppealFor(appeals, day.date, 'time_in');
                      const appealTimeOutSent = hasAppealFor(appeals, day.date, 'time_out');
                      const isExpanded = expandedDay === day.date;
                      const inWindow = schedule
                        ? `${formatTime12(schedule.time_in.open)} – ${formatTime12(schedule.time_in.close)}`
                        : '';
                      const outWindow = schedule
                        ? `${formatTime12(schedule.time_out.open)} – ${formatTime12(schedule.time_out.close)}`
                        : '';
                      const inTime = rec
                        ? formatTimeFromDate(rec.check_in_time)
                        : null;
                      const outTime = rec
                        ? formatTimeFromDate(rec.check_out_time)
                        : null;

                      const statusLabel = (() => {
                        switch (dayStatus) {
                          case 'present':
                            return 'Present';
                          case 'absent':
                            return 'Absent';
                          case 'checked_in':
                            return 'Checked In';
                          case 'can_time_in':
                            return 'Can Time In';
                          case 'can_time_out':
                            return 'Can Time Out';
                          case 'open':
                            return 'Open Today';
                          case 'closed':
                            return 'Closed';
                          case 'scheduled':
                            return 'Scheduled';
                          default:
                            return '';
                        }
                      })();

                      return (
                        <div
                          key={day.key}
                          className={`${styles.dayCard} ${isToday ? styles.dayToday : ''} ${isExpanded ? styles.dayCardOpen : ''}`}
                        >
                          <button
                            type="button"
                            className={styles.dayToggle}
                            onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                            aria-expanded={isExpanded}
                          >
                            <span className={styles.dayChevron} aria-hidden="true">
                              {isExpanded ? '▾' : '▸'}
                            </span>
                            <span className={styles.dayDayCol}>
                              <span className={styles.dayNumber}>Day {day.dayNumber}</span>
                              <span className={styles.dayDate}>
                                {formatDateLabel(day.date)}
                              </span>
                            </span>
                            <span
                              className={`${styles.dayStatus} ${
                                dayStatus === 'present' || dayStatus === 'checked_in'
                                  ? styles.dayPresent
                                  : dayStatus === 'absent'
                                    ? styles.dayAbsent
                                    : dayStatus === 'closed'
                                      ? styles.dayClosed
                                      : ''
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className={styles.dayPanel}>
                              <div className={styles.dayPanelGrid}>
                                <div className={styles.dayDetailCell}>
                                  <span className={styles.dayDetailLabel}>Batch / Supervisor</span>
                                  <span className={styles.dayMeta}>
                                    {day.batchLabel} · {day.supervisorName}
                                  </span>
                                </div>

                                <div className={styles.dayDetailCell}>
                                  <span className={styles.dayDetailLabel}>Windows</span>
                                  {inWindow && (
                                    <span className={styles.dayTime}>
                                      <b>Time In:</b> {inWindow}
                                    </span>
                                  )}
                                  {outWindow && (
                                    <span className={styles.dayTime}>
                                      <b>Time Out:</b> {outWindow}
                                    </span>
                                  )}
                                </div>

                                <div className={styles.dayDetailCell}>
                                  <span className={styles.dayDetailLabel}>Recorded</span>
                                  {inTime ? (
                                    <span className={styles.dayTimeActual}>
                                      <b>In:</b> {inTime}
                                    </span>
                                  ) : (
                                    <span className={styles.dayTimeActual}>Not yet started</span>
                                  )}
                                  {outTime && (
                                    <span className={styles.dayTimeActual}>
                                      <b>Out:</b> {outTime}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className={styles.dayPanelActions}>
                                {isToday && dayStatus === 'can_time_in' && (
                                  <button
                                    className={styles.smallPrimaryBtn}
                                    onClick={doCheckIn}
                                    disabled={busy}
                                  >
                                    Time In
                                  </button>
                                )}

                                {isToday && dayStatus === 'can_time_out' && (
                                  <button
                                    className={styles.smallSecondaryBtn}
                                    onClick={doCheckOut}
                                    disabled={busy}
                                  >
                                    Time Out
                                  </button>
                                )}

                                {/* Appeals are offered only for the event that
                                    was not recorded. A student who never timed
                                    in gets both a Time In and a Time Out
                                    appeal; a student who timed in but never
                                    timed out gets only the Time Out appeal.
                                    Each type also tracks its own filed state, so
                                    an existing appeal shows "Already appeal time
                                    in/out" instead of a duplicate button. */}
                                {canAppeal && appealTargets.includes('time_in') && (
                                  appealTimeInSent ? (
                                    <span className={styles.appealFiledBadge}>
                                      Already appeal time in
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      className={styles.appealLink}
                                      onClick={() => openAppeal('time_in', day.date)}
                                    >
                                      Appeal Time In
                                    </button>
                                  )
                                )}

                                {canAppeal && appealTargets.includes('time_out') && (
                                  appealTimeOutSent ? (
                                    <span className={styles.appealFiledBadge}>
                                      Already appeal time out
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      className={styles.appealLink}
                                      onClick={() => openAppeal('time_out', day.date)}
                                    >
                                      Appeal Time Out
                                    </button>
                                  )
                                )}

                                {/* Today only: the appeal is shown but locked
                                    until the window it disputes has closed,
                                    with the reason stated inline. */}
                                {isToday &&
                                  !appealTargets.includes('time_out') &&
                                  !appealTimeOutSent &&
                                  !rec?.check_out_time &&
                                  rec?.status !== 'present' &&
                                  appealWindowHint('time_out') && (
                                    <span className={styles.appealLockedHint}>
                                      {appealWindowHint('time_out')}
                                    </span>
                                  )}

                                {dayStatus === 'present' && !isToday && (
                                  <span className={styles.dayTimeActual}>✓ Completed</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className={styles.scheduleFooter}>
                    <button
                      type="button"
                      className={styles.historyBtn}
                      onClick={() => setShowAppealHistory(true)}
                    >
                      History of Appeal
                      {appeals.length > 0 && (
                        <span className={styles.historyCount}>{appeals.length}</span>
                      )}
                    </button>
                  </div>
                </div>
              )}

            {/* DELETE CONFIRMATION */}

            {deleteConfirm && (
              <div
                className={`${styles.modalBackdrop} ${styles.confirmBackdrop}`}
                onClick={closeDeleteConfirm}
              >
                <div
                  className={styles.confirmModal}
                  role="dialog"
                  aria-modal="true"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className={styles.confirmIcon}>
                    <TrashIcon size={26} />
                  </div>
                  <h3 className={styles.confirmTitle}>
                    {deleteConfirm.type === 'all'
                      ? 'Delete all appeals?'
                      : 'Delete this appeal?'}
                  </h3>
                  <p className={styles.confirmText}>
                    {deleteConfirm.type === 'all'
                      ? `This will permanently remove all ${deleteConfirm.count} appeal${
                          deleteConfirm.count !== 1 ? 's' : ''
                        } from your history.`
                      : 'This appeal will be permanently removed from your history.'}
                  </p>
                  <p className={styles.confirmNote}>This action cannot be undone.</p>
                  <div className={styles.confirmActions}>
                    <button
                      type="button"
                      className={styles.confirmCancel}
                      onClick={closeDeleteConfirm}
                      disabled={deletingAppealId || clearingAppeals}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.confirmDelete}
                      onClick={confirmDelete}
                      disabled={deletingAppealId || clearingAppeals}
                    >
                      <TrashIcon size={14} />
                      {clearingAppeals || deletingAppealId
                        ? 'Deleting…'
                        : deleteConfirm.type === 'all'
                          ? 'Delete All'
                          : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )}


            {/* APPEAL MODAL */}

            {showAppealForm && (
              <div
                className={styles.modalBackdrop}
                onClick={() => {
                  if (!appealSubmitting) setShowAppealForm(false);
                }}
              >
                <div
                  className={`${styles.modalContent} ${styles.modalDrawer}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className={styles.modalHeader}>
                    <h3>Submit Appeal</h3>
                    <button
                      type="button"
                      className={styles.modalClose}
                      onClick={() => setShowAppealForm(false)}
                      disabled={appealSubmitting}
                    >
                      ×
                    </button>
                  </div>

                  <form
                    className={styles.modalBody}
                    onSubmit={submitAppealForm}
                  >
                    {appealDate && (
                      <div className={styles.appealDate}>
                        Appeal for {formatDateLabel(appealDate)}
                      </div>
                    )}

                    <label className={styles.field}>
                      Type
                      <select
                        value={appealType}
                        onChange={(e) => setAppealType(e.target.value)}
                      >
                        <option value="time_in">Time In</option>
                        <option value="time_out">Time Out</option>
                      </select>
                    </label>

                    <label className={styles.field}>
                      Reason for missing attendance
                      <textarea
                        value={appealExcuse}
                        onChange={(e) => setAppealExcuse(e.target.value)}
                        rows={3}
                        placeholder="Explain why you missed the window…"
                      />
                    </label>

                    <label className={styles.field}>
                      Attachment (image / PDF, optional)
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setAppealFile(e.target.files[0])}
                      />
                    </label>

                    <div className={styles.appealActions}>
                      <button
                        type="submit"
                        className={styles.primaryBtn}
                        disabled={appealSubmitting}
                      >
                        {appealSubmitting ? 'Submitting…' : 'Submit Appeal'}
                      </button>
                      <button
                        type="button"
                        className={styles.cancelBtn}
                        onClick={() => setShowAppealForm(false)}
                        disabled={appealSubmitting}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}


            {/* APPEAL HISTORY — side drawer on desktop, centered sheet on phones */}

            {showAppealHistory && (
              <div
                className={styles.modalBackdrop}
                onClick={() => setShowAppealHistory(false)}
              >
                <div
                  className={`${styles.modalContent} ${styles.modalDrawer}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className={styles.modalHeader}>
                    <h3>History of Appeal</h3>
                    <div className={styles.modalHeaderActions}>
                      {appeals.length > 0 && (
                        <button
                          type="button"
                          className={styles.clearAllBtn}
                          onClick={() =>
                            setDeleteConfirm({ type: 'all', count: appeals.length })
                          }
                          disabled={clearingAppeals}
                        >
                          <TrashIcon size={13} />
                          {clearingAppeals ? 'Deleting…' : 'Delete All'}
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.modalClose}
                        onClick={() => setShowAppealHistory(false)}
                        aria-label="Close appeal history"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div className={styles.modalBody}>
                    {appeals.length === 0 ? (
                      <p className={styles.info}>
                        You have not submitted any appeals yet.
                      </p>
                    ) : (
                      <ul className={styles.appealList}>
                        {appeals.map((a) => (
                          <li key={a.id} className={styles.appealItem}>
                            <div className={styles.appealTop}>
                              <strong>
                                {a.attendance_type === 'time_in' ? 'Time In' : 'Time Out'}
                              </strong>
                              <div className={styles.appealTopRight}>
                                <span className={`${styles.badge} ${styles['badge_' + a.status]}`}>
                                  {a.status}
                                </span>
                                <button
                                  type="button"
                                  className={styles.appealDeleteBtn}
                                  onClick={() => setDeleteConfirm({ type: 'one', id: a.id })}
                                  disabled={deletingAppealId === a.id}
                                  title="Delete this appeal"
                                  aria-label="Delete this appeal"
                                >
                                  <TrashIcon />
                                </button>
                              </div>
                            </div>

                            {a.appeal_date && (
                              <p className={styles.appealExcuse}>
                                For {formatDateLabel(normalizeDateKey(a.appeal_date))}
                              </p>
                            )}

                            <p className={styles.appealExcuse}>{a.excuse}</p>

                            {a.file_url && (
                              <a
                                className={styles.fileLink}
                                href={a.file_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View attachment
                              </a>
                            )}

                            {a.teacher_comment && (
                              <p className={styles.comment}>
                                Teacher: {a.teacher_comment}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}


          </>
        )}

        {!loading &&
          !assigned && (
            <p
              className={
                styles.info
              }
            >
              You are not assigned to a teacher batch yet. Contact your coordinator.
            </p>
          )}


      </div>
    </div>
  );
}

export default Attendance;
