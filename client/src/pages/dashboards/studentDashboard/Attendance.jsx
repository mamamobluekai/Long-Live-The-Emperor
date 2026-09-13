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
  uploadMyFile,
  submitDailyDoc,
  updateDailyDoc,
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

    return 'closed';
  }

  if (day.date < todayDate) {
    if (
      rec &&
      (rec.check_in_time || rec.status === 'absent')
    ) {
      return rec.status === 'absent'
        ? 'absent'
        : 'present';
    }

    return 'absent';
  }

  return 'scheduled';
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

function formatSize(bytes) {
  if (!bytes) return 'Unknown size';

  if (bytes < 1024) {
    return bytes + ' B';
  }

  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
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

  // Documentation
  const [docMap, setDocMap] = useState({});
  const [showDocModal, setShowDocModal] =
    useState(false);

  const [editingDocId, setEditingDocId] =
    useState(null);

  const [docDay, setDocDay] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [docReasoning, setDocReasoning] =
    useState('');

  const [docSubmitting, setDocSubmitting] =
    useState(false);

  const [uploadedFile, setUploadedFile] =
    useState(null);

  // Appeals
  const [appeals, setAppeals] = useState([]);
  const [showAppealForm, setShowAppealForm] =
    useState(false);

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
    } else if (
      phase === 'out_closed'
    ) {
      countdownLabel =
        'Attendance for today is closed';
    }
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
      if (!window.confirm('Delete this appeal? This cannot be undone.')) {
        return;
      }
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
        return 'Attendance for today is closed.';

      default:
        return '';
    }
  };

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

  const openDocModal = (
    day
  ) => {
    /*
     * FIX:
     * Always use the normalized date when
     * looking for an existing document.
     */
    const docKey =
      normalizeDateKey(
        day.date
      );

    const existingDoc =
      docMap[docKey] ||
      docMap[
        String(day.date).slice(
          0,
          10
        )
      ] ||
      null;

    console.log(
      '[DEBUG DOC] Opening modal:',
      {
        dayDate: day.date,
        docKey,
        existingDoc,
      }
    );

    setDocDay(day);
    setDocFile(null);

    setDocReasoning(
      existingDoc?.reasoning ||
        ''
    );

    setUploadedFile(
      existingDoc?.file_id
        ? {
            id: existingDoc.file_id,
            original_name:
              existingDoc.original_name ||
              'View file',
            cloudinary_url:
              existingDoc.cloudinary_url ||
              '',
            file_size:
              existingDoc.file_size ||
              0,
            mime_type:
              existingDoc.mime_type ||
              '',
          }
        : null
    );

    setEditingDocId(
      existingDoc?.id ||
        null
    );

    setShowDocModal(true);
  };

  const closeDocModal = () => {
    setShowDocModal(false);
    setDocDay(null);
    setDocFile(null);
    setDocReasoning('');
    setUploadedFile(null);
    setEditingDocId(null);
  };

  const handleSubmitDoc =
    async (e) => {
      e.preventDefault();

      setDocSubmitting(true);

      try {
        let finalFileId =
          uploadedFile?.id ||
          null;

        /*
         * Upload new file only if
         * the user selected one.
         */
        if (docFile) {
          const uploadResult =
            await uploadMyFile(
              docFile
            );

          setUploadedFile(
            uploadResult
          );

          finalFileId =
            uploadResult.id;

          setDocFile(null);
        }

        if (!finalFileId) {
          flash(
            'error',
            'Please select a file first.'
          );

          setDocSubmitting(
            false
          );

          return;
        }

        if (
          !docReasoning.trim()
        ) {
          flash(
            'error',
            'Please provide reasoning/reflection.'
          );

          setDocSubmitting(
            false
          );

          return;
        }

        const payload = {
          date: docDay.date,
          day_number:
            docDay.dayNumber,
          reasoning:
            docReasoning.trim(),
          fileId:
            finalFileId,
          batchId:
            docDay.batchId,
        };

        const result =
          editingDocId
            ? await updateDailyDoc(
                payload
              )
            : await submitDailyDoc(
                payload
              );

        const returnedDoc =
          result.doc ||
          result;

        const docKey =
          normalizeDateKey(
            returnedDoc?.date ||
              docDay.date
          );

        console.log(
          '[DEBUG DOC] Submission result:',
          {
            returnedDoc,
            docKey,
            docDayDate:
              docDay.date,
            docDayBatchId:
              docDay.batchId,
            docDayDayNumber:
              docDay.dayNumber,
            hasDocProp:
              !!result.doc,
          }
        );

        /*
         * FIX:
         * Immediately put the returned document
         * into docMap.
         *
         * This makes the button change without
         * waiting for another page refresh.
         */
        if (
          docKey &&
          returnedDoc
        ) {
          setDocMap(
            (prev) => {
              const newMap = {
                ...prev,
                [docKey]:
                  returnedDoc,
              };

              console.log(
                '[DEBUG DOC] docMap after submission:',
                Object.keys(
                  newMap
                ),
                'doc at key:',
                newMap[docKey]
              );

              return newMap;
            }
          );
        }

        flash(
          'success',
          editingDocId
            ? 'Documentation updated successfully.'
            : 'Documentation submitted successfully.'
        );

        /*
         * Save batchId before closing the modal
         * because closeDocModal clears docDay.
         */
        const submittedBatchId =
          docDay?.batchId;

        closeDocModal();

        /*
         * FIX:
         * Wait for the server document list to
         * finish loading so docMap stays synchronized
         * with the database.
         */
        if (
          submittedBatchId
        ) {
          await loadDocs(
            submittedBatchId
          );
        }
      } catch (err) {
        console.error(
          'handleSubmitDoc error:',
          err
        );

        flash(
          'error',
          err.message ||
            'Failed to submit documentation.'
        );
      } finally {
        setDocSubmitting(
          false
        );
      }
    };

  const getDocStatusLabel =
    (doc) => {
      if (!doc) return null;

      switch (doc.status) {
        case 'graded':
          return `Graded: ${doc.teacher_score}/100`;

        case 'submitted':
          return 'Done';

        case 'reviewed':
          return 'Reviewed';

        default:
          return 'Pending';
      }
    };

  const getDocStatusClass =
    (doc) => {
      if (!doc) return '';

      switch (doc.status) {
        case 'graded':
          return styles.docGraded;

        case 'submitted':
          return styles.docSubmitted;

        case 'reviewed':
          return styles.docReviewed;

        default:
          return styles.docPending;
      }
    };

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        <h2 className={styles.title}>
          Daily Attendance
        </h2>

        <p className={styles.subtitle}>
          {new Date().toLocaleDateString(
            'en-US',
            {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }
          )}

          {' · '}
          {tz}
        </p>

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
            {inSchedule && (
              <div className={styles.statusRow}>

                <span
                  className={`${styles.phasePill} ${
                    open
                      ? styles.phaseOpen
                      : styles.phaseClosed
                  }`}
                >
                  {open
                    ? 'Open'
                    : 'Closed'}
                </span>

                <span
                  className={
                    styles.phaseText
                  }
                >
                  {phaseMessage()}
                </span>

              </div>
            )}

            {inSchedule &&
              countdownLabel &&
              countdownTarget !==
                null && (
                <div
                  className={
                    styles.countdown
                  }
                  key={nowSec}
                >
                  <span
                    className={
                      styles.countdownLabel
                    }
                  >
                    {countdownLabel}
                  </span>

                  <span
                    className={
                      styles.countdownValue
                    }
                  >
                    {fmtCountdown(
                      countdownTarget
                    )}
                  </span>
                </div>
              )}

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
                  <h3 className={styles.sectionTitle}>
                    My Schedule ({scheduleDays.length} day{scheduleDays.length !== 1 ? 's' : ''})
                  </h3>

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
                          className={`${styles.dayCard} ${isToday ? styles.dayToday : ''}`}
                        >
                          <div className={styles.dayMain}>
                            <span className={styles.dayNumber}>
                              Day {day.dayNumber}
                            </span>
                            <span className={styles.dayDate}>
                              {formatDateLabel(day.date)}
                            </span>
                            <span className={styles.dayMeta}>
                              {day.batchLabel} · {day.supervisorName}
                            </span>

                            {inWindow && (
                              <span className={styles.dayTime}>
                                Time In: {inWindow}
                              </span>
                            )}
                            {outWindow && (
                              <span className={styles.dayTime}>
                                Time Out: {outWindow}
                              </span>
                            )}
                            {inTime && (
                              <span className={styles.dayTimeActual}>
                                In: {inTime}
                              </span>
                            )}
                            {outTime && (
                              <span className={styles.dayTimeActual}>
                                Out: {outTime}
                              </span>
                            )}
                          </div>

                          <div className={styles.dayActions}>
                            <span
                              className={`${styles.dayStatus} ${
                                dayStatus === 'present' || dayStatus === 'checked_in'
                                  ? styles.dayOpen
                                  : dayStatus === 'absent'
                                    ? styles.dayAbsent
                                    : ''
                              }`}
                            >
                              {statusLabel}
                            </span>

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

                            {(dayStatus === 'absent' || (dayStatus === 'closed' && isToday)) && (
                              <button
                                className={styles.appealLink}
                                onClick={() => openAppeal('time_in', day.date)}
                              >
                                Appeal
                              </button>
                            )}

                            {dayStatus === 'present' && !isToday && (
                              <span className={styles.dayTimeActual}>✓ Completed</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
                  className={styles.modalContent}
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


            {/* EXISTING APPEALS */}

            {appeals.length >
              0 && (
              <div
                className={
                  styles.appealSection
                }
              >

                <h3
                  className={
                    styles.sectionTitle
                  }
                >
                  My Appeals
                </h3>

                <ul
                  className={
                    styles.appealList
                  }
                >

                  {appeals.map(
                    (a) => (
                      <li
                        key={a.id}
                        className={
                          styles.appealItem
                        }
                      >

                        <div
                          className={
                            styles.appealTop
                          }
                        >

                          <strong>
                            {a.attendance_type ===
                            'time_in'
                              ? 'Time In'
                              : 'Time Out'}
                          </strong>

                          <span
                            className={`${styles.badge} ${styles['badge_' + a.status]}`}
                          >
                            {
                              a.status
                            }
                          </span>

                        </div>

                        {a.appeal_date && (
                          <p
                            className={
                              styles.appealExcuse
                            }
                          >
                            For{' '}
                            {formatDateLabel(
                              normalizeDateKey(a.appeal_date)
                            )}
                          </p>
                        )}

                        <p
                          className={
                            styles.appealExcuse
                          }
                        >
                          {a.excuse}
                        </p>

                        {a.file_url && (
                          <a
                            className={
                              styles.fileLink
                            }
                            href={
                              a.file_url
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            View attachment
                          </a>
                        )}

                        {a.teacher_comment && (
                          <p
                            className={
                              styles.comment
                            }
                          >
                            Teacher:{' '}
                            {
                              a.teacher_comment
                            }
                          </p>
                        )}

                        {a.status === 'pending' && (
                          <button
                            type="button"
                            className={styles.appealLink}
                            style={{ color: '#dc2626' }}
                            onClick={() => handleDeleteAppeal(a.id)}
                            disabled={deletingAppealId === a.id}
                          >
                            {deletingAppealId === a.id
                              ? 'Deleting…'
                              : 'Delete Appeal'}
                          </button>
                        )}

                      </li>
                    )
                  )}

                </ul>

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
