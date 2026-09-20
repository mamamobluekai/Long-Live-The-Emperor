import { useEffect, useState } from 'react';
import { getSupervisorReportsConcerns } from '../../../api/supervisorApi';
import styles from './SupervisorReportsConcerns.module.css';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function SupervisorReportsConcerns() {
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setLoading(true);
      setNotice(null);
      try {
        const data = await getSupervisorReportsConcerns();
        if (!cancelled) setReports(data.reports || []);
      } catch (err) {
        if (!cancelled) setNotice({ type: 'error', text: err.message || 'Failed to load reports.' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReports();
    return () => { cancelled = true; };
  }, []);

  const visibleReports = filter === 'all'
    ? reports
    : reports.filter((report) => report.status === filter);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Reports and Concerns</h2>
          <p className={styles.subtitle}>Problems and concerns submitted from assigned student profiles.</p>
        </div>
      </div>

      {notice && <div className={`${styles.notice} ${styles['notice_' + notice.type]}`}>{notice.text}</div>}

      <div className={styles.filterRow}>
        {['all', 'open', 'resolved'].map((item) => (
          <button
            key={item}
            type="button"
            className={filter === item ? `${styles.filterBtn} ${styles.filterActive}` : styles.filterBtn}
            onClick={() => setFilter(item)}
          >
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {loading && <p className={styles.info}>Loading reports...</p>}

      <ul className={styles.list}>
        {!loading && visibleReports.length === 0 && (
          <li className={styles.empty}>No {filter} reports or concerns.</li>
        )}

        {visibleReports.map((report) => (
          <li key={report.id} className={styles.item}>
            <div className={styles.itemTop}>
              <div>
                <strong>{report.first_name} {report.last_name}</strong>
                <span className={styles.meta}>
                  {' '}· {report.student_number || 'No ID'} · {report.category} · {formatDate(report.created_at)}
                </span>
              </div>
              <div className={styles.badges}>
                <span className={`${styles.priority} ${styles['priority_' + report.priority]}`}>{report.priority}</span>
                <span className={`${styles.badge} ${styles['badge_' + report.status]}`}>{report.status}</span>
              </div>
            </div>

            <div className={styles.details}>
              <span>{report.batch_label || 'Deployment Batch'}</span>
              <span>{[report.grade_level, report.track_strand].filter(Boolean).join(' / ') || 'No academic details'}</span>
            </div>

            <p className={styles.message}>{report.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SupervisorReportsConcerns;
