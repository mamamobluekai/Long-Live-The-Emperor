import { useEffect, useState } from 'react';
import { downloadMyCertificate, getMyProgress } from '../../../api/studentApi';
import Feedback from '../../../components/Feedback';
import styles from './Progress.module.css';

// ---- Shared token system (mirrors the certificate design: navy + gold) ----
const INK = '#1c2b4a';
const GOLD = '#b3872c';
const GOLD_LIGHT = '#d4af6a';
const CREAM = '#fdf8ef';
const SLATE = '#64748b';
const LINE = '#e2e0d5';

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
    <div style={rowStyles.stepRow}>
      <div style={rowStyles.stepIconCol}>
        <div
          style={{
            ...rowStyles.stepIcon,
            background: done ? INK : '#fff',
            borderColor: done ? INK : LINE,
            color: done ? '#fff' : SLATE,
          }}
        >
          {done ? <CheckIcon /> : icon}
        </div>
        {!isLast && (
          <div
            style={{
              ...rowStyles.connector,
              background: done ? INK : LINE,
            }}
          />
        )}
      </div>
      <div style={rowStyles.stepBody}>
        <div style={rowStyles.stepTopRow}>
          <span style={rowStyles.stepLabel}>{label}</span>
          <span
            style={{
              ...rowStyles.badge,
              background: done ? '#eef2ff' : '#f8fafc',
              color: done ? INK : SLATE,
              border: `1px solid ${done ? '#c7d2fe' : LINE}`,
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
  stepRow: { display: 'flex', gap: 16 },
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
  stepLabel: { fontWeight: 600, fontSize: 15, color: '#0f172a' },
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
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div className={styles.pageHeader}>
        <h2 style={{ margin: 0, color: '#0f172a' }}>My Progress</h2>
        <p style={{ margin: '6px 0 0', color: SLATE }}>
          Track your requirements, documentation, and attendance toward immersion completion.
        </p>
      </div>

      {notice && <Feedback type="warning" message={notice} />}

      {/* Overall progress card */}
      <div
        style={{
          marginTop: 20,
          background: '#fff',
          border: `1px solid ${LINE}`,
          borderRadius: 14,
          padding: '22px 24px',
          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div
            style={{
              position: 'relative',
              width: 74,
              height: 74,
              flexShrink: 0,
              borderRadius: '50%',
              background: `conic-gradient(${INK} ${percent * 3.6}deg, ${LINE} 0deg)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: '50%',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 16,
                color: '#0f172a',
              }}
            >
              {percent}%
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: '#0f172a' }}>
              {completed ? 'All requirements met!' : 'In progress'}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: SLATE }}>
              {doneCount} of {steps.length} milestones completed.
            </p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div
        style={{
          marginTop: 18,
          background: '#fff',
          border: `1px solid ${LINE}`,
          borderRadius: 14,
          padding: '22px 24px 4px',
          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        }}
      >
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

      {/* Certificate CTA */}
      <div
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
        <RibbonIcon color={canDownload ? GOLD_LIGHT : GOLD} />

        <div style={{ flex: 1, minWidth: 220 }}>
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
              ? 'Your immersion is complete. You may now download your certificate.'
              : 'Available once requirements, documentation, and 10 attendance days are complete.'}
          </p>
        </div>

        <button
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

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&display=swap');
      `}</style>
    </div>
  );
}

export default Progress;
