import { useEffect, useState } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { getAdminDashboard } from '../../../api/adminApi';
import DashboardCard from '../../../components/admin/DashboardCard';
import LoadingSkeleton from '../../../components/admin/LoadingSkeleton';
import styles from './Dashboard.module.css';

const STAT_CARDS = [
  { key: 'totalStudents', label: 'Total Students', color: 'primary' },
  { key: 'totalTeachers', label: 'Total Teachers', color: 'success' },
  { key: 'totalSupervisors', label: 'Total Supervisors', color: 'info' },
  { key: 'totalCoordinators', label: 'Total Coordinators', color: 'warning' },
  { key: 'totalActiveUsers', label: 'Total Active Users', color: 'primary' },
  { key: 'totalPendingAccounts', label: 'Total Pending Accounts', color: 'danger' },
  { key: 'totalApprovedAccounts', label: 'Total Approved Accounts', color: 'success' },
  { key: 'totalAttendanceRecords', label: 'Total Attendance Records', color: 'info' },
  { key: 'totalRequirementsSubmitted', label: 'Total Requirements Submitted', color: 'warning' },
];

export default function AdminDashboardPage() {
  const { user } = useAdminAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const fetchStats = async () => {
      try {
        const data = await getAdminDashboard();
        if (mounted) setStats(data.stats || {});
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchStats();
    return () => { mounted = false; };
  }, []);

  const adminName = user?.first_name || user?.last_name
    ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
    : user?.email;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Welcome back, {adminName}. Here is an overview of your system.</p>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {loading ? (
        <LoadingSkeleton rows={3} variant="cards" />
      ) : (
        <div className={styles.cardsGrid}>
          {STAT_CARDS.map((card) => (
            <DashboardCard
              key={card.key}
              title={card.label}
              value={stats?.[card.key] ?? 0}
              color={card.color}
            />
          ))}
        </div>
      )}
    </div>
  );
}
