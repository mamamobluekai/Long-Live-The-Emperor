import { useEffect, useState, useCallback } from 'react';
import { downloadMyCertificate, getMyProgress } from '../../../api/studentApi';
import Feedback from '../../../components/Feedback';
import styles from './Progress.module.css';

// ---- Shared token system (maroon design system; certificate block keeps its
// own navy + gold colours and is intentionally not themed) ----
const INK = '#8b1e2d';
const GOLD = '#b3872c';
const GOLD_LIGHT = '#d4af6a';
const SLATE = '#758195';
const MAROON_LINE = '#ecdfe2';

function CheckIcon({ color = '#fff', size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M3 8.5L6.2 11.7L13 4.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RibbonIcon({ color = GOLD, size = 30 }) {
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 34 40">
      <path d="M11 24 L7 39 L17 33 Z" fill={color} opacity="0.75" />
      <path d="M23 24 L27 39 L17 33 Z" fill={color} opacity="0.55" />
      <circle cx="17" cy="14" r="13" fill="#fff" stroke={color} strokeWidth="2" />
      <path
        d="M17 6l2 5 5.4.4-4.1 3.5 1.3 5.3L17 17.2l-4.6 3-1.3-5.3-4.1-3.5L12.4 11z"
        fill={color}
      />
    </svg>
  );
}

function Step({ label, detail, done, icon, isLast }) {
  return (
    <div className={styles.stepRow} style={rowStyles.stepRow}>
      <div style={rowStyles.stepIconCol}>
        <div
          style={{
            ...rowStyles.stepIcon,
            background: done ? INK : '#fff',
            borderColor: done ? INK : MAROON_LINE,
            color: done ? '#fff' : SLATE,
          }}
        >
          {done ? <CheckIcon /> : icon}
        </div>
        {!isLast && (
          <div
            style={{
              ...rowStyles.connector,
              background: done ? INK : MAROON_LINE,
            }}
          />
        )}
      </div>
      <div style={rowStyles.stepBody}>
        <div style={rowStyles.stepTopRow} className={styles.stepTopRow}>
          <span style={rowStyles.stepLabel}>{label}</span>
          <span
            style={{
              ...rowStyles.badge,
              background: done ? '#fdf1f3' : '#f8fafc',
              color: done ? INK : SLATE,
              border: `1px solid ${done ? '#f0d7dc' : MAROON_LINE}`,
            }}
          >
            {done ? 'Completed' : 'Pending'}
          </span>
        </div>
        <div style={rowStyles.stepDetail}>{detail}</div>
      </div>
    </div>
  );
}

const rowStyles = {
  stepRow: { display: 'flex' },
  stepIconCol: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  stepIcon: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
    transition: 'background 0.2s ease, border-color 0.2s ease',
  },
  connector: { width: 2, flex: 1, minHeight: 22, margin: '2px 0' },
  stepBody: { flex: 1, paddingBottom: 22 },
  stepTopRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  stepLabel: { fontWeight: 700, fontSize: 15, color: '#172033' },
  stepDetail: { marginTop: 3, fontSize: 13, color: SLATE, lineHeight: 1.45 },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 999,
    whiteSpace: 'nowrap',
  },
};

function Progress() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [certLoading, setCertLoading] = useState(false);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await getMyProgress();
      setData(res);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load progress.');
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Auto-refresh every 15 seconds to keep attendance in sync
  useEffect(() => {
    const id = setInterval(() => {
      fetchProgress();
    }, 15000);
    return () => clearInterval(id);
  }, [fetchProgress]);

  const requirements = data?.requirements;
  const documentation = data?.documentation;
  const attendance = data?.attendance;
  const completed = data?.completed;
  const certificate = data?.certificate?.issued ? data.certificate : null;

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
        ? `${documentation.verified || 0}/${documentation.total || 0} daily docs graded`
        : `${documentation?.submitted || 0}/${documentation?.total || 0} daily docs submitted`,
      done: !!documentation?.graded,
      icon: '2',
    },
    {
      key: 'attendance',
      label: 'Attendance',
      detail: attendance?.complete
        ? `${attendance.days} of ${attendance.scheduled || attendance.required || 10} scheduled days attended`
        : `${attendance?.days || 0}/${attendance?.scheduled || attendance?.required || 10} scheduled immersion days attended`,
      done: !!attendance?.complete,
      icon: '3',
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const percent = Math.round((doneCount / steps.length) * 100);

  const handleDownload = async () => {
    try {
      setCertLoading(true);
      const { blob, filename } = await downloadMyCertificate();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setNotice(err.message || 'Unable to load your certificate right now.');
      setTimeout(() => setNotice(''), 4000);
    } finally {
      setCertLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading progress…</div>
      </div>
    );
  }
  if (error) return <Feedback type="error" message={error} />;

  const canDownload = !!(certificate || completed);

  return (
    <div className={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Lexend:wght@400;500;600;700;800&display=swap');
      `}</style>

      <div className={`${styles.pageHeader} ${styles.pageHeaderWrap}`}>
        <div>
          <h1>My Progress</h1>
          <p>Track your requirements, documentation, and attendance toward immersion completion.</p>
        </div>
      </div>

      {notice && <Feedback type="warning" message={notice} />}

      {/* Overall progress card */}
      <div className={styles.card}>
        <div className={styles.overallBody}>
          <div className={styles.ring}
            style={{
              background: `conic-gradient(#8b1e2d ${percent * 3.6}deg, #f1e3e6 0deg)`,
            }}
          >
            <div className={styles.ringInner}>{percent}%</div>
          </div>

          <div className={styles.overallText}>
            <div className={styles.eyebrow}>Overall Progress</div>
            <h3>{completed ? 'All requirements met!' : 'In progress'}</h3>
            <p>{doneCount} of {steps.length} milestones completed.</p>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className={`${styles.card} ${styles.milestonesCard}`}>
        <div className={styles.cardHeader}>
          <h2>Milestones</h2>
          <span className={styles.countBadge}>
            {doneCount}/{steps.length}
          </span>
        </div>
        <div className={styles.stepList}>
          {steps.map((s, i) => (
            <Step
              key={s.key}
              label={s.label}
              detail={s.detail}
              done={s.done}
              icon={s.icon}
              isLast={i === steps.length - 1}
            />
          ))}
        </div>
      </div>

      {/* Certificate CTA */}
      <div className={`${styles.card} ${styles.certWrap}`}>
        <div className={styles.certRibbon}>
          <RibbonIcon color={canDownload ? GOLD_LIGHT : GOLD} />
        </div>

        <div className={styles.certBody}>
          <h3>Certificate of Completion</h3>
          <p>
            {certificate
              ? 'Your certificate has been issued. You may download it now.'
              : completed
              ? 'Your immersion is complete. Downloading issues your certificate with your name on it and your batch\u2019s design.'
              : 'Available once requirements, documentation, and 10 attendance days are complete.'}
          </p>
        </div>

        <button
          className={styles.certBtn}
          onClick={handleDownload}
          disabled={!canDownload || certLoading}
          title="Download your certificate"
          style={{
            padding: '11px 22px',
            borderRadius: 999,
            border: 'none',
            fontSize: 13.5,
            fontWeight: 600,
            letterSpacing: '0.01em',
            cursor: canDownload && !certLoading ? 'pointer' : 'not-allowed',
            background: canDownload ? GOLD : '#e2e0d5',
            color: canDownload ? '#1c1206' : '#94a3b8',
            transition: 'filter 0.15s ease',
            whiteSpace: 'nowrap',
          }}
          onMouseOver={(e) => {
            if (canDownload) e.currentTarget.style.filter = 'brightness(1.08)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.filter = 'none';
          }}
        >
          {certLoading ? 'Preparing…' : 'Download Certificate'}
        </button>
      </div>
    </div>
  );
}

export default Progress;
