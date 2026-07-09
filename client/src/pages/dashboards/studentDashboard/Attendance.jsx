import { useState, useEffect } from 'react';
import axios from 'axios';
import { useLocationTracker } from '../../../hooks/useLocationTracker';
import { useAuth } from '../../../context/AuthContext';
import styles from './Attendance.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function Attendance() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const { status, teacherBatchId, error, checkIn, checkOut } = useLocationTracker({
    token,
    teacherBatchId: null,
  });

  const reloadTodayStatus = async () => {
    const res = await axios.get(`${API_URL}/tracking/attendance/today`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setTodayAttendance(res.data);
  };

  useEffect(() => {
    const fetchTodayStatus = async () => {
      try {
        const res = await axios.get(`${API_URL}/tracking/attendance/today`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setTodayAttendance(res.data);
      } catch (err) {
        console.error('Failed to fetch today status', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTodayStatus();
  }, [token]);

  const handleCheckIn = async () => {
    await checkIn();
    try {
      await reloadTodayStatus();
    } catch (err) {
      console.error('Failed to refresh status after check-in', err);
    }
  };

  const handleCheckOut = async () => {
    await checkOut();
    try {
      await reloadTodayStatus();
    } catch (err) {
      console.error('Failed to refresh status after check-out', err);
    }
  };

  const effectiveStatus = status === 'checked_in' || todayAttendance?.status === 'checked_in' ? 'checked_in' : 'checked_out';

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h2 className={styles.title}>Daily Attendance</h2>
        <p className={styles.subtitle}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>

        {loading && <p className={styles.info}>Loading status...</p>}

        {error && <p className={styles.error}>{error}</p>}

        {!loading && effectiveStatus === 'checked_out' && (
          <div className={styles.section}>
            <p className={styles.info}>
              You are currently <strong>checked out</strong>.
            </p>
            <button className={styles.checkInBtn} onClick={handleCheckIn}>
              Check In
            </button>
          </div>
        )}

        {!loading && effectiveStatus === 'checked_in' && (
          <div className={styles.section}>
            <div className={styles.statusBadge}>
              <span className={styles.dot}></span>
              Checked In
            </div>
            {teacherBatchId && (
              <p className={styles.info}>Live location sharing is active for your batch.</p>
            )}
            <p className={styles.info}>
              Location is being sent every few seconds while you remain here.
            </p>
            <button className={styles.checkOutBtn} onClick={handleCheckOut}>
              Check Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Attendance;
