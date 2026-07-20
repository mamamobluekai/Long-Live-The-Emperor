import { useEffect, useState } from 'react';
import { getMyProgress } from '../../../api/studentApi';
import Feedback from '../../../components/Feedback';
import styles from './Progress.module.css';

function Step({ label, detail, done, icon }) {
  return (
    <div className={`${styles.step} ${done ? styles.stepDone : ''}`}>
      <div className={styles.stepIcon}>{done ? '✓' : icon}</div>
      <div className={styles.stepBody}>
        <div className={styles.stepLabel}>{label}</div>
        <div className={styles.stepDetail}>{detail}</div>
      </div>
      <span className={`${styles.stepBadge} ${done ? styles.badgeDone : styles.badgePending}`}>
        {done ? 'Completed' : 'Pending'}
      </span>
    </div>
  );
}

function Progress() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError('');
      try {
        const res = await getMyProgress();
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load progress.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const requirements = data?.requirements;
  const documentation = data?.documentation;
  const attendance = data?.attendance;
  const completed = data?.completed;

  const steps = [
    {
      key: 'requirements',
      label: 'Requirements',
      detail: requirements?.approved
        ? 'Approved by coordinator'
        : `Status: ${requirements?.status || 'Not submitted'}`,
      done: !!requirements?.approved,
      icon: '1',
    },
    {
      key: 'documentation',
      label: 'Documentation',
      detail: documentation?.graded
        ? 'All documents graded'
        : `${documentation?.verified || 0}/${documentation?.total || 0} documents graded`,
      done: !!documentation?.graded,
      icon: '2',
    },
    {
      key: 'attendance',
      label: 'Attendance',
      detail: attendance?.complete
        ? `${attendance.days} days completed`
        : `${attendance?.days || 0}/${attendance?.required || 10} immersion days completed`,
      done: !!attendance?.complete,
      icon: '3',
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const percent = Math.round((doneCount / steps.length) * 100);

  const handleDownload = () => {
    setNotice('Certification download is not available yet (testing only).');
    setTimeout(() => setNotice(''), 4000);
  };

  if (loading) return <p className={styles.loading}>Loading progress…</p>;
  if (error) return <Feedback type="error" message={error} />;

  return (
    <>
      <div className={styles.pageHeader}>
        <h2>My Progress</h2>
        <p>Track your requirements, documentation, and attendance toward immersion completion.</p>
      </div>

      {notice && <Feedback type="warning" message={notice} />}

      <div className={styles.overall}>
        <div className={styles.bar}>
          <div className={styles.barFill} style={{ width: `${percent}%` }} />
        </div>
        <div className={styles.overallMeta}>
          <h3>{completed ? 'All requirements met!' : 'In progress'}</h3>
          <p>{doneCount} of {steps.length} milestones completed.</p>
        </div>
      </div>

      <div className={styles.steps}>
        {steps.map((s) => (
          <Step
            key={s.key}
            label={s.label}
            detail={s.detail}
            done={s.done}
            icon={s.icon}
          />
        ))}
      </div>

      <div className={styles.certSection}>
        <div className={styles.certInfo}>
          <h3>Certificate of Completion</h3>
          <p>
            {completed
              ? 'Your immersion is complete. You may now download your certificate.'
              : 'Available once requirements, documentation, and 10 attendance days are complete.'}
          </p>
        </div>
        <button
          className={styles.downloadBtn}
          onClick={handleDownload}
          disabled={!completed}
          title={completed ? '' : 'Locked until all milestones are complete'}
        >
          Download Certificate
        </button>
      </div>
    </>
  );
}

export default Progress;
