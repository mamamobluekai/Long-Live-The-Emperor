import { useState, useEffect, useRef } from 'react';

import { useAuth } from '../../../context/AuthContext';
import {
  getStudentAttendanceAccess,
  studentCheckIn,
  studentCheckOut,
  updateStudentLocation,
} from '../../../api/attendanceApi';

import styles from './StudentAttendanceDemo.module.css';

function StudentAttendanceDemo() {
  const { token } = useAuth();

  /* ---- attendance ---- */
  const [accessLoading, setAccessLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  /* ---- location ---- */
  const [locationSharing, setLocationSharing] = useState(false);
  const [locationError, setLocationError] = useState(null);

  /* ---- UI ---- */
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  const geoWatchId = useRef(null);

  /* =========================================================
     FETCH ATTENDANCE ACCESS
     ========================================================= */
  useEffect(() => {
    let cancelled = false;
    const fetchAccess = async () => {
      if (!token) return;
      setAccessLoading(true);
      try {
        const data = await getStudentAttendanceAccess(token);
        if (!cancelled) {
          setManualOpen(!!data?.manual_open);
          setAttendanceOpen(!!data?.attendance_open);
          if (data?.today?.status === 'checked_in') {
            setCheckedIn(true);
          } else if (data?.today?.status === 'checked_out') {
            setCheckedIn(false);
          }
        }
       } catch {
      if (!cancelled) {
        setManualOpen(false);
          setAttendanceOpen(false);
        }
      } finally {
        if (!cancelled) {
          setAccessLoading(false);
          setPageLoading(false);
        }
      }
    };
    fetchAccess();
    return () => {
      cancelled = true;
    };
  }, [token]);

  /* =========================================================
     LIVE LOCATION TRACKING
     ========================================================= */
  const startLocationTracking = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }
    setLocationError(null);
    setLocationSharing(true);

    geoWatchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        await sendLocation(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
        );
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocationError(
            'Location permission denied. Please allow location access in your browser settings.',
          );
          setLocationSharing(false);
          clearWatch();
        } else if (err.code === err.TIMEOUT) {
          setLocationError('Location request timed out. Retrying...');
        } else {
          setLocationError(`Location error: ${err.message}`);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 3000,
      },
    );
  };

  const clearWatch = () => {
    if (geoWatchId.current !== null) {
      navigator.geolocation.clearWatch(geoWatchId.current);
      geoWatchId.current = null;
    }
  };

  const stopLocationTracking = () => {
    clearWatch();
    setLocationSharing(false);
    setLocationError(null);
  };

  /* =========================================================
     LOCATION SEND TO BACKEND
     ========================================================= */
  const sendLocation = async (lat, lng, acc) => {
    try {
      await updateStudentLocation(lat, lng, acc || 0, token);
    } catch {
      /* silent — location may not be recorded if not checked in */
    }
  };

  /* =========================================================
      MANUAL ATTENDANCE — CHECK-IN
      ========================================================= */
  const handleManualCheckIn = async () => {
    setActionLoading(true);
    setActionMsg(null);

    try {
      const pos = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation is not supported by your browser.'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 3000,
        });
      });
      const result = await studentCheckIn(
        pos.coords.latitude,
        pos.coords.longitude,
        pos.coords.accuracy || 0,
        token,
      );
      setCheckedIn(true);
      setActionMsg({
        type: 'success',
        text: result?.message || 'Timed in successfully. Location sharing started.',
      });
      startLocationTracking();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'An error occurred during check-in.';
      setActionMsg({
        type: msg.toLowerCase().includes('manual') ? 'info' : 'error',
        text: msg,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualCheckOut = async () => {
    setActionLoading(true);
    setActionMsg(null);

    try {
      let latitude;
      let longitude;
      let currentAccuracy;

      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 3000,
          });
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        currentAccuracy = pos.coords.accuracy;
      } catch {
        // Time out is still allowed when the final GPS reading is unavailable.
      }

      const result = await studentCheckOut(
        latitude,
        longitude,
        currentAccuracy || 0,
        token,
      );
      setCheckedIn(false);
      stopLocationTracking();
      setActionMsg({
        type: 'success',
        text: result?.message || 'Timed out successfully. Location sharing stopped.',
      });
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: err?.response?.data?.message || err?.message || 'Check-out failed.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  /* =========================================================
     CLEANUP ON UNMOUNT
     ========================================================= */
  useEffect(() => {
    return () => {
      clearWatch();
    };
  }, []);

  /* =========================================================
      RENDER
      ========================================================= */
  if (pageLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.loadingScreen}>
            <div className={styles.loadingSpinner} />
            <p>Loading Attendance Demo…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Manual Attendance</h1>
          <p className={styles.subtitle}>
            Time in or time out when manual attendance is opened. Your live
            location is shared with your teacher after you time in.
          </p>
        </div>

        {actionMsg && (
          <div
            className={
              actionMsg.type === 'success'
                ? styles.noticeSuccess
                : actionMsg.type === 'error'
                  ? styles.noticeError
                  : styles.noticeInfo
            }
          >
            <span>{actionMsg.text}</span>
          </div>
        )}

        <div className={styles.statusBar}>
          <span className={styles.statusLabel}>Manual Open:</span>
          <span className={styles.statusValue}>
            {accessLoading ? 'Loading...' : manualOpen ? 'Yes' : 'No'}
          </span>
          <span
            className={`${styles.badge} ${
              manualOpen ? styles.badgeManual : styles.badgeNotManual
            }`}
          >
            {manualOpen ? 'Open' : 'Closed'}
          </span>
        </div>

        <div className={styles.statusBar}>
          <span className={styles.statusLabel}>Attendance Open:</span>
          <span className={styles.statusValue}>
            {accessLoading ? '...' : attendanceOpen ? 'Yes' : 'No'}
          </span>
        </div>

        <div className={styles.statusBar}>
          <span className={styles.statusLabel}>Check-In Status:</span>
          <span className={styles.statusValue}>
            {checkedIn ? 'Checked In' : 'Not Checked In'}
          </span>
          <span
            className={`${styles.badge} ${
              checkedIn ? styles.badgeCheckedIn : styles.badgeNotCheckedIn
            }`}
          >
            {checkedIn ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <span
            className={`${styles.statusDot} ${locationSharing ? styles.active : ''}`}
          />
          <span className={styles.statusValue}>
            {locationSharing
              ? 'Live location sharing active'
              : 'Location sharing stopped'}
          </span>
        </div>

        {locationError && (
          <div className={styles.info}>
            <strong>Location Error:</strong> {locationError}
          </div>
        )}

        <div className={styles.actionBar}>
          {!checkedIn ? (
            <button
              className={styles.manualBtn}
              onClick={handleManualCheckIn}
              disabled={actionLoading || !manualOpen}
            >
              Manual Attendance Check In
            </button>
          ) : (
            <button
              className={styles.secondaryBtn}
              onClick={handleManualCheckOut}
              disabled={actionLoading}
            >
              Check Out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudentAttendanceDemo;
