import { useEffect, useState } from 'react';
import {
  Award,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Save,
  X,
} from 'lucide-react';
import {
  supervisorGenerateCertificate,
  supervisorForceGenerateCertificate,
  supervisorUndoForceIssue,
  supervisorGetCertificateTemplate,
  supervisorSaveCertificateTemplate,
} from '../../../api/certificateApi';
import { getSupervisorBatches } from '../../../api/supervisorApi';
import styles from './SupervisorCertifications.module.css';

const EMPTY_TEMPLATE = {
  school_name: 'Work Immersion Program',
  company_name: 'Host Company',
  program_name: 'Work Immersion',
  footer_text:
    'Verify this certificate at the issuing institution. This is an official record of work immersion completion.',
  border_color: '#8b1e2d',
  title_text: 'CERTIFICATE OF COMPLETION',
};

// ---------------------------------------------------------------------------
// Certificate preview
//
// This mirrors server/controllers/certificateControllers/certificate.controller.js
// (buildCertificatePdf). The PDF is A4 landscape at 842x595pt; the preview is
// drawn at 760px wide and scaled positions by 0.9, so the two read the same.
// The certificate keeps a serif face on purpose - it is a document, not UI.
// ---------------------------------------------------------------------------

const PDF_W = 842;
const PREVIEW_W = 760;
const S = PREVIEW_W / PDF_W; // pt -> px

/** Mirrors the server's tint() so the preview tints the accent identically. */
function tint(hex, alpha) {
  const m = String(hex || '#8b1e2d').trim().replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return `rgba(139,30,45,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Mirrors the server's inkFor(). */
function inkFor(hex, mix = 0) {
  const m = String(hex || '#8b1e2d').trim().replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return '#1c1f2b';
  const to = (c, t) => Math.round(c + (t - c) * mix);
  return `rgb(${to((n >> 16) & 255, 255)}, ${to((n >> 8) & 255, 255)}, ${to(n & 255, 255)})`;
}

function CornerFlourish({ color, position }) {
  const flipX = position.includes('right');
  const flipY = position.includes('bottom');
  return (
    <svg
      width={54 * S}
      height={54 * S}
      viewBox="-14 -14 68 68"
      style={{
        position: 'absolute',
        top: position.includes('top') ? 26 * S : undefined,
        bottom: position.includes('bottom') ? 26 * S : undefined,
        left: position.includes('left') ? 26 * S : undefined,
        right: position.includes('right') ? 26 * S : undefined,
        transform: `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`,
        overflow: 'visible',
      }}
      aria-hidden="true"
    >
      <path d="M0 54 L0 0 L54 0" stroke={color} strokeWidth="1.6" fill="none" />
      <path d="M8 38 L38 8" stroke={tint(color, 0.6)} strokeWidth="0.7" fill="none" />
      <circle cx="4" cy="4" r="2.6" fill={color} />
      <circle cx="4" cy="4" r="5.2" fill="none" stroke={tint(color, 0.5)} strokeWidth="0.7" />
    </svg>
  );
}

function CertificateSeal({ color }) {
  const r = 34 * S;
  return (
    <svg width={r * 2} height={(r * 2) + 22 * S} viewBox={`0 0 ${r * 2} ${r * 2 + 22 * S}`} aria-hidden="true">
      {/* ribbon tails */}
      <path
        d={`M${r - 15 * S} ${r + 20 * S} L${r - 4 * S} ${r + 50 * S} L${r + 6 * S} ${r + 38 * S} L${r + 15 * S} ${r + 20 * S} Z`}
        fill={tint(color, 0.75)}
      />
      <path
        d={`M${r + 15 * S} ${r + 20 * S} L${r + 4 * S} ${r + 50 * S} L${r - 6 * S} ${r + 38 * S} L${r - 15 * S} ${r + 20 * S} Z`}
        fill={tint(color, 0.55)}
      />
      <circle cx={r} cy={r} r={r} fill="none" stroke={color} strokeWidth={1.6 * S} />
      <circle cx={r} cy={r} r={r - 6 * S} fill="none" stroke={tint(color, 0.55)} strokeWidth={0.7 * S} />
      <circle
        cx={r}
        cy={r}
        r={r - 10 * S}
        fill="none"
        stroke={tint(color, 0.45)}
        strokeWidth={0.5 * S}
        strokeDasharray={`${1.6 * S} ${2.2 * S}`}
      />
      <path
        d={`M${r} ${r - 12 * S} L${r + 3.6 * S} ${r - 3.9 * S} L${r + 11.8 * S} ${r - 3.2 * S} L${r + 5.6 * S} ${r + 2.4 * S} L${r + 7.7 * S} ${r + 10.4 * S} L${r} ${r + 5.9 * S} L${r - 7.7 * S} ${r + 10.4 * S} L${r - 5.6 * S} ${r + 2.4 * S} L${r - 11.8 * S} ${r - 3.2 * S} L${r - 3.6 * S} ${r - 3.9 * S} Z`}
        fill={color}
      />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 8 + Math.PI / 8;
        return (
          <circle
            key={i}
            cx={r + Math.cos(a) * (r - 16 * S)}
            cy={r + Math.sin(a) * (r - 16 * S)}
            r={1.1 * S}
            fill={tint(color, 0.6)}
          />
        );
      })}
      <text
        x={r}
        y={r + 13 * S}
        textAnchor="middle"
        fontSize={5.6 * S}
        fill={tint(color, 0.55)}
        letterSpacing={1.6 * S}
        fontFamily="Helvetica, Arial, sans-serif"
      >
        VERIFIED
      </text>
    </svg>
  );
}

function CertificatePreview({
  template,
  sampleName = 'Juan Dela Cruz',
  sampleSupervisor = 'Liza M. Fernandez',
}) {
  const accent = template.border_color || '#8b1e2d';
  const INK = inkFor(accent, 0.12);
  const BODY = inkFor(accent, 0.34);
  const MUTED = inkFor(accent, 0.55);
  const PAPER = '#fffdf9';

  // Same vertical rhythm as the PDF, converted from pt to preview px.
  const W = PREVIEW_W;
  const M = 34 * S;
  const H = 595 * S;
  const footRuleY = H - M - 48 * S;
  const footTextY = H - M - 38 * S;
  const metaY = H - M - 80 * S;
  const sigLabelY = H - M - 128 * S;
  const sigRuleY = H - M - 116 * S;
  const sealCy = sigRuleY - 90 * S;

  const titleY = M + 66 * S;
  const ruleY = titleY + 40 * S;
  const certifyY = ruleY + 22 * S;
  const nameY = certifyY + 22 * S;
  const nameSize = (sampleName.length > 30 ? 28 : sampleName.length > 20 ? 32 : 36) * S;
  const nameRuleY = nameY + nameSize + 8 * S;
  const nameRuleW = Math.min(340, PDF_W * 0.34) * S;
  const bodyY = Math.min(nameRuleY + 24 * S, sealCy - 60 * S - 34 * S);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: PREVIEW_W,
        aspectRatio: `${PDF_W} / 595`,
        margin: '0 auto',
        background: PAPER,
        fontFamily: '"Cormorant Garamond", "EB Garamond", "Iowan Old Style", Georgia, serif',
        color: INK,
        boxShadow: `0 24px 50px -18px rgba(15, 23, 42, 0.32), inset 0 0 0 ${2.6 * S}px ${accent}, inset 0 0 0 ${6.6 * S}px ${tint(accent, 0.55)}, inset 0 0 0 ${12 * S}px ${PAPER}, inset 0 0 0 ${12.5 * S}px ${tint(accent, 0.3)}`,
      }}
    >
      {/* corner washes */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 300 * S,
          height: 300 * S,
          borderRadius: '50%',
          background: accent,
          opacity: 0.05,
          transform: 'translate(-40%, -40%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 300 * S,
          height: 300 * S,
          borderRadius: '50%',
          background: accent,
          opacity: 0.05,
          transform: 'translate(40%, 40%)',
        }}
      />

      <CornerFlourish color={accent} position="top-left" />
      <CornerFlourish color={accent} position="top-right" />
      <CornerFlourish color={accent} position="bottom-left" />
      <CornerFlourish color={accent} position="bottom-right" />

      {/* eyebrow */}
      <div
        style={{
          position: 'absolute',
          top: M + 32 * S,
          left: M + 44 * S,
          right: M + 44 * S,
          textAlign: 'center',
          fontStyle: 'italic',
          fontSize: 10.5 * S,
          color: MUTED,
          letterSpacing: 2.4 * S,
          textTransform: 'uppercase',
        }}
      >
        {template.school_name}
      </div>

      {/* tick */}
      <svg
        width={PREVIEW_W}
        height={14 * S}
        style={{ position: 'absolute', top: M + 46 * S, left: 0 }}
        aria-hidden="true"
      >
        <line x1={PREVIEW_W / 2 - 26 * S} y1={7 * S} x2={PREVIEW_W / 2 - 6 * S} y2={7 * S} stroke={tint(accent, 0.45)} strokeWidth={0.7} />
        <line x1={PREVIEW_W / 2 + 6 * S} y1={7 * S} x2={PREVIEW_W / 2 + 26 * S} y2={7 * S} stroke={tint(accent, 0.45)} strokeWidth={0.7} />
        <rect
          x={PREVIEW_W / 2 - 3.1 * S}
          y={3.9 * S}
          width={6.2 * S}
          height={6.2 * S}
          fill={accent}
          transform={`rotate(45 ${PREVIEW_W / 2} 7 ${7 * S})`}
        />
      </svg>

      {/* title */}
      <div
        style={{
          position: 'absolute',
          top: titleY,
          left: M + 40 * S,
          right: M + 40 * S,
          textAlign: 'center',
          fontSize: 30 * S,
          fontWeight: 700,
          letterSpacing: 3.2 * S,
          lineHeight: 1.15,
        }}
      >
        {template.title_text || 'CERTIFICATE OF COMPLETION'}
      </div>

      {/* ornamental rule */}
      <svg
        width={PREVIEW_W}
        height={22 * S}
        style={{ position: 'absolute', top: ruleY - 11 * S, left: 0 }}
        aria-hidden="true"
      >
        <line x1={PREVIEW_W / 2 - 164 * S} y1={11 * S} x2={PREVIEW_W / 2 - 12 * S} y2={11 * S} stroke={tint(accent, 0.4)} strokeWidth={0.9} />
        <line x1={PREVIEW_W / 2 + 12 * S} y1={11 * S} x2={PREVIEW_W / 2 + 164 * S} y2={11 * S} stroke={tint(accent, 0.4)} strokeWidth={0.9} />
        <rect
          x={PREVIEW_W / 2 - 5.7 * S}
          y={11 * S - 5.7 * S}
          width={11.4 * S}
          height={11.4 * S}
          fill="none"
          stroke={accent}
          strokeWidth={1.2 * S}
          transform={`rotate(45 ${PREVIEW_W / 2} ${11 * S})`}
        />
        <circle cx={PREVIEW_W / 2} cy={11 * S} r={8.5 * S} fill="none" stroke={tint(accent, 0.4)} strokeWidth={0.6} />
      </svg>

      {/* certify + name + rule + body */}
      <div
        style={{
          position: 'absolute',
          top: certifyY,
          left: M + 60 * S,
          right: M + 60 * S,
          textAlign: 'center',
          fontStyle: 'italic',
          fontSize: 13 * S,
          color: BODY,
        }}
      >
        This is to certify that
      </div>

      <div
        style={{
          position: 'absolute',
          top: nameY,
          left: M + 90 * S,
          right: M + 90 * S,
          textAlign: 'center',
          fontSize: nameSize,
          fontWeight: 700,
          fontStyle: 'italic',
          color: INK,
          lineHeight: 1.1,
        }}
      >
        {sampleName}
      </div>

      <svg
        width={PREVIEW_W}
        height={12 * S}
        style={{ position: 'absolute', top: nameRuleY - 6 * S, left: 0 }}
        aria-hidden="true"
      >
        <line
          x1={PREVIEW_W / 2 - nameRuleW / 2}
          y1={6 * S}
          x2={PREVIEW_W / 2 + nameRuleW / 2}
          y2={6 * S}
          stroke={accent}
          strokeWidth={1.1}
        />
        <line
          x1={PREVIEW_W / 2 - nameRuleW / 2 + 18 * S}
          y1={11 * S}
          x2={PREVIEW_W / 2 + nameRuleW / 2 - 18 * S}
          y2={11 * S}
          stroke={tint(accent, 0.4)}
          strokeWidth={0.6}
        />
      </svg>

      <div
        style={{
          position: 'absolute',
          top: bodyY,
          left: M + 130 * S,
          right: M + 130 * S,
          textAlign: 'center',
          fontSize: 12.5 * S,
          color: BODY,
          lineHeight: 1.6,
        }}
      >
        has successfully completed the {template.program_name} at{' '}
        <strong>{template.company_name || 'Host Company'}</strong>, having fulfilled all required
        hours, daily documentation, and evaluation standards.
      </div>

      {/* seal */}
      <div style={{ position: 'absolute', top: sealCy - 34 * S, left: '50%', transform: 'translateX(-50%)' }}>
        <CertificateSeal color={accent} />
      </div>

      {/* signatures - real names above the rules, symmetric about the centre */}
      {[
        { edge: -230 * S, signer: sampleSupervisor, role: 'Work Immersion Supervisor' },
        { edge: 30 * S, signer: template.company_name || 'Host Company', role: 'Company Representative' },
      ].map((sig) => (
        <div
          key={sig.role}
          style={{
            position: 'absolute',
            top: sigLabelY - 22 * S,
            left: `calc(50% + ${sig.edge}px)`,
            width: 200 * S,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 11.5 * S,
              fontStyle: 'italic',
              color: INK,
              marginBottom: 3 * S,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {sig.signer}
          </div>
          <div style={{ position: 'relative', height: 1 }}>
            <div style={{ height: 1, background: tint(accent, 0.5) }} />
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: -6 * S,
                width: 1.4,
                height: 7 * S,
                background: accent,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 6 * S,
              fontSize: 9 * S,
              color: MUTED,
              letterSpacing: 0.8 * S,
            }}
          >
            {sig.role}
          </div>
        </div>
      ))}

      {/* meta row - three equal columns so the middle value is truly centred */}
      <div
        style={{
          position: 'absolute',
          top: metaY,
          left: M + 60 * S,
          width: W - (M + 60) * 2,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          fontFamily: 'Helvetica, Arial, sans-serif',
          fontSize: 7.6 * S,
          color: MUTED,
        }}
      >
        <span style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Issued by: {sampleSupervisor}
        </span>
        <span style={{ textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Certificate No. CERT-0000000-0
        </span>
        <span style={{ textAlign: 'right' }}>September 30, 2026</span>
      </div>

      {/* footer */}
      <div
        style={{
          position: 'absolute',
          top: footRuleY,
          left: M + 150 * S,
          right: M + 150 * S,
          height: 1,
          background: tint(accent, 0.22),
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: footTextY,
          left: M + 120 * S,
          right: M + 120 * S,
          textAlign: 'center',
          fontSize: 8 * S,
          fontStyle: 'italic',
          color: MUTED,
          lineHeight: 1.4,
        }}
      >
        {template.footer_text}
      </div>
    </div>
  );
}

function SupervisorCertifications() {
  const [batches, setBatches] = useState([]);
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
    // Maroon, matching the rest of the supervisor UI. The certificate's own
    // accent stays user-editable from the design modal.
    border_color: '#8b1e2d',
    title_text: 'CERTIFICATE OF COMPLETION',
  });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [designModalOpen, setDesignModalOpen] = useState(false);
  // 'default' = the supervisor-wide design; a number = that batch's own design.
  const [designScope, setDesignScope] = useState('default');
  const [templatesByBatch, setTemplatesByBatch] = useState({});

  // Every batch can hold its own design. Load them all once so switching scope
  // is instant and the preview always reflects the selected batch.
  const loadAll = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const [batchesData, templateData] = await Promise.all([
        getSupervisorBatches(),
        supervisorGetCertificateTemplate('default'),
      ]);
      const rawBatches = batchesData.batches || [];
      setBatches(rawBatches);

      const teacherBatches = rawBatches.filter((b) => b.source === 'teacher');
      const perBatch = await Promise.all(
        teacherBatches.map((b) =>
          supervisorGetCertificateTemplate(b.request_id).catch(() => null)
        )
      );
      const byBatch = { default: templateData || {} };
      teacherBatches.forEach((b, i) => {
        if (perBatch[i]) byBatch[b.request_id] = perBatch[i];
      });
      setTemplatesByBatch(byBatch);

      // Editing or previewing a batch's design shows that batch's values.
      const active =
        designScope !== 'default' ? byBatch[designScope] : null;
      setTemplate({ ...EMPTY_TEMPLATE, ...(templateData || {}), ...(active || {}) });

      const forced = {};
      for (const batch of rawBatches) {
        for (const s of batch.students || []) {
          if (s.certificate_number && String(s.certificate_number).startsWith('CERT-FORCE-')) {
            forced[s.user_id] = s.certificate_number;
          }
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

  // Escape closes whichever modal is open and locks page scroll behind it.
  useEffect(() => {
    const anyOpen = designModalOpen || Boolean(confirmForceId);
    if (!anyOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (confirmForceId) setConfirmForceId(null);
      else setDesignModalOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [designModalOpen, confirmForceId]);

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
      setBatches((prev) =>
        prev.map((batch) => ({
          ...batch,
          students: batch.students
            ? batch.students.map((s) =>
                s.user_id === studentId
                  ? { ...s, certificate_number: null, certificate_url: null }
                  : s
              )
            : batch.students,
        }))
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

  const sanitizeText = (value) => {
    if (typeof value !== 'string') return value;
    return value.replace(/<[^>]*>/g, '').trim();
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    setSavingTemplate(true);
    setError('');
    setMessage('');
    try {
      const teacherBatchId = designScope === 'default' ? null : Number(designScope);
      const payload = {
        school_name: sanitizeText(template.school_name),
        company_name: sanitizeText(template.company_name),
        program_name: sanitizeText(template.program_name),
        footer_text: sanitizeText(template.footer_text),
        border_color: sanitizeText(template.border_color),
        title_text: sanitizeText(template.title_text),
        teacher_batch_id: teacherBatchId,
      };
      const saved = await supervisorSaveCertificateTemplate(payload);
      setTemplatesByBatch((prev) =>
        teacherBatchId == null
          ? prev
          : { ...prev, [teacherBatchId]: { ...template, ...saved } }
      );
      setTemplate({ ...template, ...saved });
      setMessage(
        teacherBatchId == null
          ? 'Default certificate design saved.'
          : 'Certificate design saved for that batch.'
      );
      setDesignModalOpen(false);
      await loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <div className={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=EB+Garamond:ital@0;1&display=swap');
      `}</style>

      <div className={styles.pageHeader}>
        <div className={styles.headerIcon}>
          <Award size={24} />
        </div>
        <div>
          <h1>Certifications</h1>
          <p>Edit your certificate design, then generate signed PDF certificates for students assigned to your batches.</p>
        </div>
      </div>

      {message && (
        <div className={`${styles.toast} ${styles.toastSuccess}`} role="status">
          <span className={styles.toastIcon} aria-hidden="true">
            <CheckCircle2 size={16} />
          </span>
          <span className={styles.toastBody}>{message}</span>
          <button
            type="button"
            className={styles.toastClose}
            aria-label="Dismiss"
            onClick={() => setMessage('')}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {error && (
        <div className={`${styles.toast} ${styles.toastError}`} role="alert">
          <span className={styles.toastIcon} aria-hidden="true">
            <AlertCircle size={16} />
          </span>
          <span className={styles.toastBody}>{error}</span>
          <button
            type="button"
            className={styles.toastClose}
            aria-label="Dismiss"
            onClick={() => setError('')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Preview sits on top so the supervisor sees the current design before
          deciding whether to edit it. */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Certificate Preview</h2>
            <p>How every generated certificate will look.</p>
          </div>
          <button
            type="button"
            className={styles.btn}
            onClick={() => setDesignModalOpen(true)}
          >
            <Pencil size={15} />
            Edit Design
          </button>
        </div>

        <div className={styles.cardBody}>
          <div className={styles.previewWrap}>
            <CertificatePreview template={template} />
          </div>
          <p className={styles.previewNote}>
            Sample names shown. Generated certificates carry the student&rsquo;s and
            supervisor&rsquo;s real names, plus the host company from that batch&rsquo;s design.
          </p>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Assigned Students</h2>
            <p>Generate certificates for students who have completed immersion.</p>
          </div>
        </div>

        <div className={styles.cardBody}>
          <div className={styles.filterRow}>
            <select className={styles.select} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All Students</option>
              <option value="completed">Completed</option>
              <option value="incomplete">Incomplete</option>
            </select>
            <span className={styles.muted}>
              {batches.reduce((sum, b) => sum + (b.students?.length || 0), 0)} total
            </span>
          </div>
          {loading ? (
            <p className={styles.loading}>Loading students...</p>
          ) : batches.length === 0 ? (
            <p className={styles.loading}>No batches assigned to you yet.</p>
          ) : (
            batches.map((b) => {
              const batchStudents = (b.students || []).filter((s) =>
                filter === 'completed' ? s.completed : filter === 'incomplete' ? !s.completed : true
              );
              if (batchStudents.length === 0) return null;
              return (
                <div key={`${b.source}-${b.request_id}`} className={styles.batchCard}>
                  <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Student ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchStudents.map((s) => (
                        <tr key={s.user_id}>
                          <td>{s.student_number}</td>
                          <td>{s.first_name} {s.last_name}</td>
                          <td>{s.email}</td>
                          <td>
                            <span className={`${styles.badge} ${s.completed ? styles.badgeApproved : styles.badgePending}`}>
                              {s.completed ? 'Completed' : 'Incomplete'}
                            </span>
                          </td>
                          <td>
                            {s.certificate_number ? (
                              <span className={styles.certifiedText}>Certified</span>
                            ) : forcedIds[s.user_id] ? (
                              <button
                                className={styles.btnSecondary}
                                type="button"
                                onClick={() => handleUndoForce(s.user_id)}
                                disabled={generatingId === s.user_id}
                              >
                                {generatingId === s.user_id ? 'Undoing...' : 'Undo Deploy'}
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
                                Deploy Certificate
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
          )}
        </div>
      </section>

      {/* Certificate design editor - a modal so the preview above stays put
          and the page never reflows while editing. */}
      {designModalOpen && (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDesignModalOpen(false);
          }}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="design-modal-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <h3 id="design-modal-title">Certificate Design</h3>
                <p>These values appear on every generated certificate.</p>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                aria-label="Close"
                onClick={() => setDesignModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className={styles.modalBody}>
              <label className={styles.filterField}>
                Applies to
                <select
                  className={styles.select}
                  value={designScope}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDesignScope(next);
                    // Switch the form to that scope's saved values, falling
                    // back to the shared default for a batch with none yet.
                    const nextTemplate =
                      next === 'default'
                        ? templatesByBatch.default
                        : templatesByBatch[next] || templatesByBatch.default;
                    setTemplate({ ...EMPTY_TEMPLATE, ...(nextTemplate || {}) });
                  }}
                >
                  <option value="default">Default (all batches without their own)</option>
                  {batches
                    .filter((b) => b.source === 'teacher')
                    .map((b) => (
                      <option key={b.request_id} value={b.request_id}>
                        {b.batch_label}
                      </option>
                    ))}
                </select>
              </label>

              <p className={styles.scopeNote}>
                {designScope === 'default'
                  ? 'Used by any of your batches that does not have a design of its own.'
                  : 'This design is used for every certificate issued in that batch.'}
              </p>

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

              <div className={styles.row}>
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

              <label className={styles.filterField}>
                Footer Text
                <textarea
                  className={styles.textarea}
                  value={template.footer_text}
                  onChange={(e) => handleTemplateChange('footer_text', e.target.value)}
                  required
                />
              </label>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setDesignModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btn} disabled={savingTemplate}>
                  <Save size={15} />
                  {savingTemplate ? 'Saving...' : 'Save Design'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmForceId && (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmForceId(null);
          }}
        >
          <div
            className={`${styles.modal} ${styles.modalNarrow}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="force-issue-title"
            aria-describedby="force-issue-body"
          >
            <div className={styles.modalHeader}>
              <h3 id="force-issue-title">Force Issue Certificate?</h3>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.confirmText} id="force-issue-body">
                This will generate a completion certificate even though this student has not yet
                completed all milestones. Are you sure you want to continue?
              </p>
              <div className={styles.modalActions}>
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
        </div>
      )}
    </div>
  );
}

export default SupervisorCertifications;
