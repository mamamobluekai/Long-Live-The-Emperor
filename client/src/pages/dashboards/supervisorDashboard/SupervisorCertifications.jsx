import { useEffect, useState, useMemo } from 'react';
import {
  supervisorGetAllStudents,
  supervisorGenerateCertificate,
  supervisorForceGenerateCertificate,
  supervisorUndoForceIssue,
  supervisorGetCertificateTemplate,
  supervisorSaveCertificateTemplate,
} from '../../../api/certificateApi';
import styles from './SupervisorDashboard.module.css';

function CornerOrnament({ color, corner }) {
  const transforms = { tl: 'rotate(0deg)', tr: 'rotate(90deg)', br: 'rotate(180deg)', bl: 'rotate(270deg)' };
  const positions = {
    tl: { top: 14, left: 14 },
    tr: { top: 14, right: 14 },
    br: { bottom: 14, right: 14 },
    bl: { bottom: 14, left: 14 },
  };
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 34 34"
      style={{ position: 'absolute', ...positions[corner], transform: transforms[corner] }}
    >
      <path d="M2 2H22M2 2V22" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="square" />
      <path d="M2 9C7 9 9 7 9 2" stroke={color} strokeWidth="1" fill="none" strokeLinecap="round" />
      <circle cx="2" cy="2" r="1.6" fill={color} />
    </svg>
  );
}

function CertificateSeal({ color }) {
  return (
    <svg width="64" height="80" viewBox="0 0 64 80">
      <path d="M20 46 L14 78 L32 68 Z" fill={color} opacity="0.85" />
      <path d="M44 46 L50 78 L32 68 Z" fill={color} opacity="0.65" />
      <circle cx="32" cy="30" r="26" fill="#fff" stroke={color} strokeWidth="2" />
      <circle cx="32" cy="30" r="20" fill="none" stroke={color} strokeWidth="1" strokeDasharray="2 3" />
      <path d="M32 16l3.5 9.5 9.5.7-7.3 6.3 2.3 9.2L32 41.5l-8.7 4.4 2.3-9.2-7.3-6.3 9.5-.7z" fill={color} />
    </svg>
  );
}

function SupervisorCertifications() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [generatingId, setGeneratingId] = useState(null);
  const [confirmForceId, setConfirmForceId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [forcedIds, setForcedIds] = useState({});

  const [template, setTemplate] = useState({
    school_name: 'Work Immersion Program',
    company_name: 'Host Company',
    program_name: 'Work Immersion',
    footer_text: 'Verify this certificate at the issuing institution. This is an official record of work immersion completion.',
    border_color: '#1e3a8a',
    title_text: 'CERTIFICATE OF COMPLETION',
  });
  const [savingTemplate, setSavingTemplate] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const [eligibleData, templateData] = await Promise.all([
        supervisorGetAllStudents(),
        supervisorGetCertificateTemplate(),
      ]);
      const raw = eligibleData.eligible || [];
      setList(raw);
      setTemplate((prev) => ({ ...prev, ...(templateData || {}) }));

      const forced = {};
      for (const s of raw) {
        if (s.certificate_number && String(s.certificate_number).startsWith('CERT-FORCE-')) {
          forced[s.user_id] = s.certificate_number;
        }
      }
      setForcedIds(forced);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleGenerate = async (studentId) => {
    setGeneratingId(studentId);
    setError('');
    setMessage('');
    try {
      const data = await supervisorGenerateCertificate(studentId);
      if (data?.certificate) {
        setMessage(`Certificate ${data.certificate.certificate_number} generated successfully.`);
        loadAll();
      } else {
        setMessage(data?.message || 'Certificate already existed.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleForceGenerate = async (studentId) => {
    setGeneratingId(studentId);
    setError('');
    setMessage('');
    try {
      const data = await supervisorForceGenerateCertificate(studentId);
      if (data?.certificate) {
        setMessage(`Force-issued certificate ${data.certificate.certificate_number} for student.`);
        setConfirmForceId(null);
        loadAll();
      } else {
        setMessage(data?.message || 'Certificate action completed.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleUndoForce = async (studentId) => {
    setGeneratingId(studentId);
    setError('');
    setMessage('');
    try {
      await supervisorUndoForceIssue(studentId);
      setMessage('Force-issued certificate removed.');
      setForcedIds((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
      setList((prev) =>
        prev.map((student) =>
          student.user_id === studentId
            ? { ...student, certificate_number: null, certificate_url: null }
            : student
        )
      );
      await loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleTemplateChange = (field, value) => {
    setTemplate((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    setSavingTemplate(true);
    setError('');
    setMessage('');
    try {
      const saved = await supervisorSaveCertificateTemplate(template);
      setTemplate((prev) => ({ ...prev, ...saved }));
      setMessage('Certificate design saved.');
      await loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  const accent = template.border_color || '#1e3a8a';

  const outerFrameStyle = useMemo(
    () => ({
      width: '100%',
      maxWidth: 760,
      aspectRatio: '3 / 2',
      margin: '0 auto',
      background: '#fffdf8',
      border: `2px solid ${accent}`,
      boxShadow: `inset 0 0 0 6px #fffdf8, inset 0 0 0 7px ${accent}55, 0 24px 50px -18px rgba(15, 23, 42, 0.35)`,
      borderRadius: 4,
      position: 'relative',
      padding: '30px 46px',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '"Cormorant Garamond", "Iowan Old Style", Georgia, "Times New Roman", serif',
    }),
    [accent]
  );

  return (
    <div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=EB+Garamond:ital@0;1&display=swap');
      `}</style>

      <div className={styles.pageHeader}>
        <h2>Certifications</h2>
        <p>Edit your certificate design, then generate signed PDF certificates for students assigned to your batches.</p>
      </div>

      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Certificate Design</h3>
        <form onSubmit={handleSaveTemplate}>
          <div className={styles.row}>
            <label className={styles.filterField}>
              Program
              <input
                className={styles.input}
                value={template.program_name}
                onChange={(e) => handleTemplateChange('program_name', e.target.value)}
                required
              />
            </label>
            <label className={styles.filterField}>
              School / Issuer
              <input
                className={styles.input}
                value={template.school_name}
                onChange={(e) => handleTemplateChange('school_name', e.target.value)}
                required
              />
            </label>
          </div>

          <div className={styles.row} style={{ marginTop: 12 }}>
            <label className={styles.filterField}>
              Company / Host
              <input
                className={styles.input}
                value={template.company_name}
                onChange={(e) => handleTemplateChange('company_name', e.target.value)}
                required
              />
            </label>
            <label className={styles.filterField}>
              Accent Color
              <input
                className={styles.input}
                type="color"
                value={template.border_color}
                onChange={(e) => handleTemplateChange('border_color', e.target.value)}
              />
            </label>
          </div>

          <label className={styles.filterField} style={{ marginTop: 12 }}>
            Footer Text
            <textarea
              className={styles.textarea}
              value={template.footer_text}
              onChange={(e) => handleTemplateChange('footer_text', e.target.value)}
              required
            />
          </label>

          <div className={styles.actions} style={{ marginTop: 14 }}>
            <button className={styles.btn} type="submit" disabled={savingTemplate}>
              {savingTemplate ? 'Saving...' : 'Save Student Download Design'}
            </button>
          </div>
        </form>

        <div style={{ marginTop: 24 }}>
          <h4 className={styles.sectionTitle} style={{ marginBottom: 14 }}>
            Preview
          </h4>

          <div style={outerFrameStyle}>
            <CornerOrnament color={accent} corner="tl" />
            <CornerOrnament color={accent} corner="tr" />
            <CornerOrnament color={accent} corner="bl" />
            <CornerOrnament color={accent} corner="br" />

            <div style={{ textAlign: 'center', marginTop: 6 }}>
              <p
                style={{
                  margin: 0,
                  fontFamily: '"EB Garamond", Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: 12,
                  letterSpacing: '0.22em',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                }}
              >
                {template.school_name}
              </p>
              <h2
                style={{
                  margin: '8px 0 0',
                  fontSize: 30,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  color: '#1c1f2b',
                  lineHeight: 1.15,
                }}
              >
                {template.title_text || 'CERTIFICATE OF COMPLETION'}
              </h2>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
              gap: 12,
              margin: '14px auto 0',
              width: '64%',
                }}
              >
                <span style={{ flex: 1, height: 1, background: accent, opacity: 0.5 }} />
                <span
                  style={{
                    width: 5,
                    height: 5,
                    background: accent,
                    transform: 'rotate(45deg)',
                    display: 'inline-block',
                  }}
                />
                <span style={{ flex: 1, height: 1, background: accent, opacity: 0.5 }} />
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
              <p
                style={{
                  margin: 0,
                  fontFamily: '"EB Garamond", Georgia, serif',
                  fontStyle: 'italic',
                  color: '#4b5563',
                  fontSize: 16,
                }}
              >
                This is to certify that
              </p>
              <p
                style={{
                  margin: '8px 0',
                  fontSize: 34,
                  fontWeight: 600,
                  fontStyle: 'italic',
                  color: '#1c1f2b',
                  borderBottom: `1px solid ${accent}66`,
                  display: 'inline-block',
                  padding: '0 6px 5px',
                  alignSelf: 'center',
                }}
              >
                Juan Dela Cruz
              </p>
              <p
                style={{
                  margin: '8px auto 0',
                  fontFamily: '"EB Garamond", Georgia, serif',
                  color: '#374151',
                  fontSize: 15,
                  maxWidth: '74%',
                  lineHeight: 1.5,
                }}
              >
                has successfully completed the {template.program_name} at{' '}
                <strong style={{ fontWeight: 600 }}>{template.company_name || 'Host Company'}</strong>, having
                fulfilled all required hours, documentation, and evaluation standards.
              </p>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <CertificateSeal color={accent} />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 14,
                  marginTop: 8,
                }}
              >
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ borderTop: '1px solid #94a3b8', margin: '0 4px 5px' }} />
                  <p style={{ margin: 0, fontSize: 10, color: '#64748b', letterSpacing: '0.04em' }}>
                    Work Immersion Supervisor
                  </p>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ borderTop: '1px solid #94a3b8', margin: '0 4px 5px' }} />
                  <p style={{ margin: 0, fontSize: 10, color: '#64748b', letterSpacing: '0.04em' }}>
                    Company Representative
                  </p>
                </div>
              </div>

              <p
                style={{
                  textAlign: 'center',
                  color: '#94a3b8',
                  fontSize: 8,
                  lineHeight: 1.4,
                  marginTop: 12,
                  fontFamily: '"EB Garamond", Georgia, serif',
                }}
              >
                {template.footer_text}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Assigned Students</h3>
        <div className={styles.row} style={{ marginBottom: 12 }}>
          <select className={styles.select} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All Students</option>
            <option value="completed">Completed</option>
            <option value="incomplete">Incomplete</option>
          </select>
          <span className={styles.muted} style={{ alignSelf: 'center' }}>
            {list.length} total
          </span>
        </div>
        {loading ? (
          <p className={styles.loading}>Loading students...</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Grade</th>
                  <th>Strand</th>
                  <th>Attendance</th>
                  <th>Docs</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {list
                  .filter((s) => (filter === 'completed' ? s.completed : filter === 'incomplete' ? !s.completed : true))
                  .map((s) => (
                    <tr key={s.user_id}>
                      <td>{s.student_number}</td>
                      <td>{s.first_name} {s.last_name}</td>
                      <td>{s.email}</td>
                      <td>{s.grade_level || '-'}</td>
                      <td>{s.track_strand || '-'}</td>
                      <td>{s.attendance_days || 0}</td>
                      <td>{s.verified_documents || 0}/{s.total_documents || 0}</td>
                      <td>
                        <span className={`${styles.badge} ${s.completed ? styles.badgeApproved : styles.badgePending}`}>
                          {s.completed ? 'Completed' : 'Incomplete'}
                        </span>
                      </td>
                      <td>
                        {forcedIds[s.user_id] ? (
                          <button
                            className={styles.btnSecondary}
                            type="button"
                            onClick={() => handleUndoForce(s.user_id)}
                            disabled={generatingId === s.user_id}
                          >
                            {generatingId === s.user_id ? 'Undoing...' : 'Undo Force Issue'}
                          </button>
                        ) : s.completed ? (
                          <button
                            className={styles.btn}
                            onClick={() => handleGenerate(s.user_id)}
                            disabled={generatingId === s.user_id}
                          >
                            {generatingId === s.user_id ? 'Generating...' : 'Generate Certificate'}
                          </button>
                        ) : (
                          <button
                            className={styles.btnSecondary}
                            type="button"
                            onClick={() => setConfirmForceId(s.user_id)}
                            disabled={generatingId === s.user_id}
                          >
                            Force Issue
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmForceId && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 18,
            padding: 24,
            maxWidth: 420,
            width: '92%',
            boxShadow: '0 20px 44px -12px rgba(15,23,42,0.35)',
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Force Issue Certificate?</h3>
            <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 14 }}>
              This will generate a completion certificate even though this student has not yet completed all milestones. Are you sure you want to continue?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className={styles.btnSecondary}
                type="button"
                onClick={() => setConfirmForceId(null)}
                disabled={generatingId === confirmForceId}
              >
                Cancel
              </button>
              <button
                className={styles.btn}
                type="button"
                onClick={() => handleForceGenerate(confirmForceId)}
                disabled={generatingId === confirmForceId}
              >
                {generatingId === confirmForceId ? 'Issuing...' : 'Yes, Issue Certificate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SupervisorCertifications;
