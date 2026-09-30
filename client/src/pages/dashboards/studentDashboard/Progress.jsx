import { useEffect, useState, useCallback } from 'react';
import { downloadMyCertificate, getMyProgress } from '../../../api/studentApi';
import Feedback from '../../../components/Feedback';
import styles from './Progress.module.css';

// ---- Shared token system (maroon design system; certificate block keeps its
// own navy + gold colours and is intentionally not themed) ----
const INK = '#8b1e2d';
const GOLD = '#b3872c';
const GOLD_LIGHT = '#d4af6a';
const CREAM = '#fdf8ef';
const SLATE = '#758195';
const LINE = '#e2e0d5'; // certificate block only
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
      <div style={{ padding: '48px 0', textAlign: 'center', color: SLATE, fontSize: 14 }}>
        Loading progress…
      </div>
    );
  }
  if (error) return <Feedback type="error" message={error} />;

  const canDownload = !!(certificate || completed);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1500,
        margin: '0 auto',
        fontFamily: "'Lexend', Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: '#26313f',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Lexend:wght@400;500;600;700;800&display=swap');
      `}</style>

      <div
        className={`${styles.pageHeader} ${styles.pageHeaderWrap}`}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          padding: '22px 24px',
          border: '1px solid #e8d2d8',
          borderRadius: 18,
          background:
            'radial-gradient(130% 160% at 0% 0%, rgba(139, 30, 45, 0.1) 0%, rgba(139, 30, 45, 0) 58%),' +
            'radial-gradient(120% 150% at 100% 120%, rgba(190, 140, 63, 0.16) 0%, rgba(190, 140, 63, 0) 55%),' +
            'linear-gradient(120deg, #ffffff 0%, #fdf3f5 58%, #f9e8ec 100%)',
          boxShadow: '0 14px 32px -28px rgba(80, 20, 32, 0.55)',
        }}
      >
        <div>
          <div
            style={{
              marginBottom: 6,
              color: '#8b1e2d',
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.11em',
              textTransform: 'uppercase',
            }}
          >
            Immersion Tracker
          </div>
          <h2
            style={{
              margin: 0,
              color: '#172033',
              fontSize: '1.85rem',
              fontWeight: 780,
              letterSpacing: '-0.035em',
              lineHeight: 1.15,
            }}
          >
            My Progress
          </h2>
          <p style={{ margin: '8px 0 0', maxWidth: 650, color: '#596579', fontSize: '0.95rem', lineHeight: 1.6 }}>
            Track your requirements, documentation, and attendance toward immersion completion.
          </p>
        </div>
        <div
          className={styles.headerIcon}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            flexShrink: 0,
            borderRadius: 14,
            background: 'linear-gradient(140deg, #8b1e2d, #b8394f)',
            color: '#fff',
            boxShadow: '0 8px 16px -10px rgba(139, 30, 45, 0.75)',
            fontSize: '1.25rem',
          }}
        >
          ✓
        </div>
      </div>

      {notice && <Feedback type="warning" message={notice} />}

      {/* Overall progress card */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          marginTop: 20,
          marginBottom: 20,
          background: 'linear-gradient(180deg, #fffdfd 0%, #ffffff 40%)',
          border: '1px solid #e2c9cf',
          borderRadius: 18,
          padding: '24px 26px',
          boxShadow: '0 12px 32px -28px rgba(80, 20, 32, 0.4)',
        }}
      >
        <div className={styles.overallBody}>
          <div
            className={styles.ring}
            style={{
              background: `conic-gradient(#8b1e2d ${percent * 3.6}deg, #f1e3e6 0deg)`,
            }}
          >
            <div className={styles.ringInner}>{percent}%</div>
          </div>

          <div className={styles.overallText}>
            <div
              style={{
                marginBottom: 8,
                color: '#8b1e2d',
                fontSize: '0.7rem',
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Overall Progress
            </div>
            <h3 style={{ margin: 0, color: '#172033', fontSize: '1.25rem', fontWeight: 750, letterSpacing: '-0.015em' }}>
              {completed ? 'All requirements met!' : 'In progress'}
            </h3>
            <p style={{ margin: '5px 0 0', fontSize: '0.9rem', color: '#758195', lineHeight: 1.55 }}>
              {doneCount} of {steps.length} milestones completed.
            </p>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div
        className={styles.milestonesCard}
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, #fffdfd 0%, #ffffff 40%)',
          border: '1px solid #e6dfe2',
          borderRadius: 18,
          padding: '22px 24px 4px',
          boxShadow: '0 12px 32px -28px rgba(80, 20, 32, 0.4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <h3 style={{ margin: 0, color: '#172033', fontSize: '1.05rem', fontWeight: 750, letterSpacing: '-0.015em' }}>
            Milestones
          </h3>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 28,
              height: 28,
              padding: '0 8px',
              color: '#8b1e2d',
              background: '#fff7f8',
              border: '1px solid #f0d7dc',
              borderRadius: 999,
              fontSize: '0.74rem',
              fontWeight: 750,
            }}
          >
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
      <div
        className={styles.certWrap}
        style={{
          marginTop: 18,
          background: canDownload
            ? `linear-gradient(135deg, ${INK} 0%, #101a30 100%)`
            : CREAM,
          border: `1px solid ${canDownload ? INK : LINE}`,
          borderRadius: 14,
          padding: '22px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <div className={styles.certRibbon}>
          <RibbonIcon color={canDownload ? GOLD_LIGHT : GOLD} />
        </div>

        <div className={styles.certBody}>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              color: canDownload ? '#fff' : '#0f172a',
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              letterSpacing: '0.02em',
            }}
          >
            Certificate of Completion
          </h3>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 13.5,
              lineHeight: 1.5,
              color: canDownload ? 'rgba(255,255,255,0.75)' : SLATE,
              maxWidth: 460,
            }}
          >
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
