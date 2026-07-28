import { useEffect, useState, useMemo } from 'react';
import {
  supervisorGetAllStudents,
  supervisorGenerateCertificate,
  supervisorForceGenerateCertificate,
  supervisorGetCertificateTemplate,
  supervisorSaveCertificateTemplate,
} from '../../../api/certificateApi';
import styles from './SupervisorDashboard.module.css';

function SupervisorCertifications() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [generatingId, setGeneratingId] = useState(null);
  const [confirmForceId, setConfirmForceId] = useState(null);
  const [filter, setFilter] = useState('all');

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
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  const previewStyle = useMemo(
    () => ({
      border: `4px solid ${template.border_color || '#1e3a8a'}`,
      borderRadius: 6,
      padding: 24,
      background: '#fff',
      boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
    }),
    [template.border_color]
  );

  return (
    <div>
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
              Border Color
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
              {savingTemplate ? 'Saving...' : 'Save Design'}
            </button>
          </div>
        </form>

        <div style={{ marginTop: 20 }}>
          <h4 className={styles.sectionTitle} style={{ marginBottom: 10 }}>
            Preview
          </h4>
          <div style={previewStyle}>
            <div
              style={{
                height: 4,
                background: template.border_color || '#1e3a8a',
                borderRadius: 2,
                marginBottom: 16,
              }}
            />
            <h2
              style={{
                margin: 0,
                textAlign: 'center',
                fontSize: 22,
                fontWeight: 700,
                color: '#0f172a',
              }}
            >
              {template.title_text || 'CERTIFICATE OF COMPLETION'}
            </h2>
            <p style={{ margin: '8px 0 0', textAlign: 'center', color: '#475569', fontSize: 12 }}>
              {template.program_name}
            </p>
            <div
              style={{
                margin: '16px auto',
                width: '80%',
                height: 1,
                background: '#cbd5e1',
              }}
            />
            <p style={{ textAlign: 'center', color: '#334155', margin: 0 }}>
              This is to certify that
            </p>
            <p
              style={{
                textAlign: 'center',
                fontWeight: 700,
                fontSize: 20,
                color: '#0f172a',
                margin: '8px 0',
              }}
            >
              Juan Dela Cruz
            </p>
            <p
              style={{
                textAlign: 'center',
                color: '#334155',
                fontSize: 12,
                maxWidth: '80%',
                margin: '0 auto',
              }}
            >
              has successfully completed the {template.program_name} at {template.company_name || 'Host Company'}
            </p>
            <p
              style={{
                textAlign: 'center',
                color: '#64748b',
                fontSize: 11,
                marginTop: 12,
              }}
            >
              Requirements approved · Documentation verified · Attendance completed
            </p>
            <p
              style={{
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: 9,
                marginTop: 16,
              }}
            >
              {template.footer_text}
            </p>
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
                        {s.completed ? (
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
