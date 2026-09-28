import { useEffect, useState } from 'react';
import {
  getMyRequirements,
  updateMyRequirements,
  submitMyRequirements,
  uploadMyDocument,
  deleteMyDocument,
  getActiveRequirements,
} from '../../../api/studentApi';
import styles from './Requirements.module.css';

const SECTION_META = {
  personal: {
    label: 'Personal Information',
    shortLabel: 'Personal',
  },
  guardian: {
    label: 'Guardian & Emergency',
    shortLabel: 'Guardian',
  },
  medical: {
    label: 'Medical Documents',
    shortLabel: 'Medical',
  },
  academic: {
    label: 'Academic Documents',
    shortLabel: 'Academic',
  },
};

const FALLBACK_DOCS = [
  { code: 'guardian_consent', section: 'guardian', name: 'Guardian Consent' },
  { code: 'medical_certificate', section: 'medical', name: 'Medical Certificate' },
  { code: 'accident_insurance', section: 'medical', name: 'Accident Insurance' },
  { code: 'vaccination_record', section: 'medical', name: 'Vaccination Record' },
  { code: 'emergency_contact_form', section: 'medical', name: 'Emergency Contact Form' },
  { code: 'form_138', section: 'academic', name: 'Form 138' },
  { code: 'good_moral', section: 'academic', name: 'Good Moral Certificate' },
  { code: 'psa_birth_certificate', section: 'academic', name: 'PSA Birth Certificate' },
  { code: 'id_picture', section: 'academic', name: 'ID Picture' },
  { code: 'student_profile_form', section: 'academic', name: 'Student Profile Form' },
];

// Philippine mobile numbers: 09XXXXXXXXX, optionally +63 or 63 prefix, with
// spaces/dashes/parentheses allowed. Anything else is rejected.
const PHONE_PATTERN = /^(?:\+?63|0)?9\d{9}$/;

function normalizePhone(value) {
  return String(value || '').replace(/[\s\-().]/g, '');
}

function isValidPhone(value) {
  const digits = normalizePhone(value);
  return PHONE_PATTERN.test(digits);
}

const PHONE_FIELDS = [
  'contact_number',
  'guardian_contact',
  'emergency_contact_number',
];

const PHONE_LABELS = {
  contact_number: 'Contact Number',
  guardian_contact: 'Guardian Contact',
  emergency_contact_number: 'Emergency Contact Number',
};

// Whole-number fields: digits only, so letters/decimals can never be entered.
const INT_FIELDS = {
  age: { label: 'Age', min: 1, max: 120, placeholder: '18' },
  student_number: { label: 'Student Number', min: null, max: null, placeholder: 'e.g., 2024-001' },
};

const isValidInt = (value, { min, max }) => {
  const trimmed = String(value ?? '').trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const n = Number(trimmed);
  if (min != null && n < min) return false;
  if (max != null && n > max) return false;
  return true;
};

const isValidStudentNumber = (value) => {
  const trimmed = String(value ?? '').trim();
  // Allows "2024-00123" style ids; digits and separators only.
  return /^[\d]+([-/]\d+)*$/.test(trimmed);
};

function Requirements() {
  const [data, setData] = useState(null);
  const [docTypes, setDocTypes] = useState(FALLBACK_DOCS);
  const [activeTab, setActiveTab] = useState('personal');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(null);
  const [uploadFile, setUploadFile] = useState({});
  const [deleting, setDeleting] = useState(null);
  const [phoneErrors, setPhoneErrors] = useState({});
  const [intErrors, setIntErrors] = useState({});

  // Live-check every phone field so the student sees the problem while typing.
  const validatePhone = (field, value) => {
    if (!String(value || '').trim()) {
      setPhoneErrors((prev) => {
        if (!(field in prev)) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
      return true;
    }
    const valid = isValidPhone(value);
    setPhoneErrors((prev) => {
      if (valid && !(field in prev)) return prev;
      if (valid && prev[field] === PHONE_LABELS[field]) return prev;
      const next = { ...prev };
      if (valid) delete next[field];
      else next[field] = PHONE_LABELS[field];
      return next;
    });
    return valid;
  };

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setError('');
      setMessage('');
      try {
        const [reqResult, typesResult] = await Promise.all([
          getMyRequirements(),
          getActiveRequirements().catch(() => null),
        ]);
        if (!cancelled) {
          setData(reqResult);
          if (typesResult?.documentTypes && typesResult.documentTypes.length > 0) {
            setDocTypes(typesResult.documentTypes.map((dt) => ({
              code: dt.code,
              name: dt.name,
              section: dt.section || 'academic',
              description: dt.description || '',
            })));
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const student = data?.student || {};
  const submission = data?.submission || {};
  const documents = data?.documents || [];
  const progress = data?.progress ?? 0;
  const sections = data?.sections || {};

  const uploadCount = docTypes.filter((d) =>
    documents.some((sd) => sd.code === d.code)
  ).length;

  // Maroon progress, turning gold then green as the uploads complete.
  const progressColor =
    progress >= 100
      ? 'linear-gradient(90deg, #15803d 0%, #27a35a 100%)'
      : progress >= 50
        ? 'linear-gradient(90deg, #8b1e2d 0%, #b8394f 100%)'
        : 'linear-gradient(90deg, #b3872c 0%, #d4af6a 100%)';

  // Age and Student Number accept digits only; anything else is flagged.
  const validateInt = (field, value) => {
    const raw = String(value ?? '');
    // Drop invalid characters as they are typed so the box stays clean.
    const cleaned = field === 'student_number' ? raw.replace(/[^\d\-/]/g, '') : raw.replace(/\D/g, '');
    if (cleaned !== raw) {
      setData((prev) => ({ ...prev, student: { ...prev.student, [field]: cleaned } }));
    }
    if (!cleaned) {
      setIntErrors((prev) => {
        if (!(field in prev)) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
      return true;
    }
    const config = INT_FIELDS[field];
    const valid =
      field === 'student_number' ? isValidStudentNumber(cleaned) : isValidInt(cleaned, config);
    setIntErrors((prev) => {
      if (valid && !(field in prev)) return prev;
      const next = { ...prev };
      if (valid) delete next[field];
      else next[field] = config.label;
      return next;
    });
    return valid;
  };

  const intFieldProps = (field) => {
    const config = INT_FIELDS[field];
    const error = intErrors[field];
    return {
      value: student[field] ?? '',
      onChange: (e) => validateInt(field, e.target.value),
      placeholder: config.placeholder,
      inputMode: 'numeric',
      min: config.min ?? undefined,
      max: config.max ?? undefined,
      'aria-invalid': !!error,
      'aria-describedby': error ? `${field}-error` : undefined,
      className: error ? `${styles.input} ${styles.inputError}` : styles.input,
    };
  };

  const intErrorText = (field) => {
    const error = intErrors[field];
    if (!error) return null;
    const config = INT_FIELDS[field];
    const hint =
      field === 'age'
        ? `${config.label}: whole number between ${config.min} and ${config.max}`
        : `${config.label}: digits only (e.g. 2024-00123)`;
    return (
      <div className={styles.fieldError} id={`${field}-error`}>
        {hint}
      </div>
    );
  };

  const handleFieldChange = (field, value) => {
    setData((prev) => ({
      ...prev,
      student: { ...prev.student, [field]: value },
    }));
    if (PHONE_FIELDS.includes(field)) validatePhone(field, value);
  };

  // Shared props for the three phone inputs: numeric keypad, live error text.
  const phoneFieldProps = (field) => {
    const error = phoneErrors[field];
    return {
      value: student[field] || '',
      onChange: (e) => handleFieldChange(field, e.target.value),
      placeholder: '09XXXXXXXXX',
      inputMode: 'tel',
      pattern: '[0-9+()\\- ]*',
      'aria-invalid': !!error,
      'aria-describedby': error ? `${field}-error` : undefined,
      className: error ? `${styles.input} ${styles.inputError}` : styles.input,
    };
  };

  const phoneErrorText = (field) =>
    phoneErrors[field] ? (
      <div className={styles.fieldError} id={`${field}-error`}>
        {phoneErrors[field]}: numbers only (e.g. 09171234567)
      </div>
    ) : null;

  // Any phone or whole-number field still holding an invalid value blocks
  // saving and submitting, so bad data never reaches the server.
  const invalidPhoneField = PHONE_FIELDS.find((f) => phoneErrors[f]);
  const invalidIntField = Object.keys(INT_FIELDS).find((f) => intErrors[f]);

  const guardFields = () => {
    if (invalidPhoneField) {
      return `${PHONE_LABELS[invalidPhoneField]} must be numbers only (e.g. 09171234567).`;
    }
    if (invalidIntField) {
      return `${INT_FIELDS[invalidIntField].label} must be a valid whole number.`;
    }
    return null;
  };

  const handleSave = async () => {
    const blocked = guardFields();
    if (blocked) {
      setError(blocked);
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await updateMyRequirements(student);
      setData((prev) => ({ ...prev, ...result }));
      setMessage('Progress saved automatically.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    const blocked = guardFields();
    if (blocked) {
      setError(blocked);
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const result = await submitMyRequirements();
      setData((prev) => ({ ...prev, submission: { ...prev.submission, status: result.status } }));
      setMessage(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async (docCode) => {
    const file = uploadFile[docCode];
    if (!file) return;
    setUploading(docCode);
    setError('');
    setMessage('');
    try {
      const result = await uploadMyDocument(file, docCode);
      setData((prev) => ({
        ...prev,
        documents: [...prev.documents, result.document],
        progress: result.progress,
        missingDocuments: docTypes.map((d) => d.code),
      }));
      setMessage(`${file.name} uploaded successfully.`);
      setUploadFile((p) => ({ ...p, [docCode]: null }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Remove this uploaded document?')) return;
    setDeleting(docId);
    setError('');
    try {
      await deleteMyDocument(docId);
      setData((prev) => ({
        ...prev,
        documents: prev.documents.filter((d) => d.id !== docId),
      }));
      setMessage('Document removed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleFileChange = (docCode, e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('File must be under 10MB.');
      e.target.value = '';
      return;
    }
    setUploadFile((p) => ({ ...p, [docCode]: file }));
  };

  const docsBySection = (section) => {
    return docTypes.filter((d) => d.section === section).map((type) => ({
      ...type,
      doc: documents.find((sd) => sd.code === type.code) || null,
    }));
  };

  const renderDocItem = (item) => {
    const doc = item.doc;
    const disabled = !!doc;
    const isUploadingDoc = uploading === item.code;
    const currentFile = uploadFile[item.code];
    const hasExisting = !!doc;

    return (
      <div key={item.code} className={styles.docItem}>
        <div className={styles.docInfo}>
          <div className={styles.docName}>{item.name}</div>
          <div className={styles.docMeta}>
            {hasExisting ? (
              <>
                Uploaded: {doc.original_name}
                {doc.mime_type && ` (${doc.mime_type.split('/')[1]?.toUpperCase() || 'file'})`}
              </>
            ) : (
              'Not uploaded'
            )}
          </div>
          {currentFile && !hasExisting && (
            <div className={styles.docMeta}>New: {currentFile.name}</div>
          )}
        </div>
        <div className={styles.docActions}>
          {hasExisting ? (
            <>
              <span className={`${styles.badge} ${styles.badgeVerified}`}>Uploaded</span>
              {doc.cloudinary_url && (
                <a
                  className={styles.btnGhost}
                  href={doc.cloudinary_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  View
                </a>
              )}
              <button
                className={styles.btnDanger}
                disabled={deleting === doc.id}
                onClick={() => handleDelete(doc.id)}
              >
                {deleting === doc.id ? 'Removing...' : 'Remove'}
              </button>
            </>
          ) : (
            <button
              className={styles.btnSuccess}
              disabled={isUploadingDoc || !currentFile}
              onClick={() => handleUpload(item.code)}
            >
              {isUploadingDoc ? 'Uploading...' : 'Upload'}
            </button>
          )}
          <span className={styles.fileName}>
            <input
              type="file"
              onChange={(e) => handleFileChange(item.code, e)}
              disabled={disabled || isUploadingDoc}
            />
          </span>
        </div>
      </div>
    );
  };

  const renderPersonalForm = () => (
    <div className={styles.grid2}>
      <div className={styles.field}>
        <label>Student Number <span className={styles.requiredDiamond}>*</span></label>
        <input
          {...intFieldProps('student_number')}
          readOnly={!!submission?.submitted_at}
        />
        {intErrorText('student_number')}
      </div>
      <div className={styles.field}>
        <label>First Name <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          value={student.first_name || ''}
          onChange={(e) => handleFieldChange('first_name', e.target.value)}
          placeholder="Juan"
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>Middle Name <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          value={student.middle_name || ''}
          onChange={(e) => handleFieldChange('middle_name', e.target.value)}
          placeholder="Dela"
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>Last Name <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          value={student.last_name || ''}
          onChange={(e) => handleFieldChange('last_name', e.target.value)}
          placeholder="Cruz"
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>Suffix</label>
        <input
          className={styles.input}
          value={student.suffix || ''}
          onChange={(e) => handleFieldChange('suffix', e.target.value)}
          placeholder="Jr./Sr."
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>Gender <span className={styles.requiredDiamond}>*</span></label>
        <select
          className={styles.select}
          value={student.gender || ''}
          onChange={(e) => handleFieldChange('gender', e.target.value)}
          readOnly={!!submission?.submitted_at}
          style={{ width: '100%' }}
        >
          <option value="">Select</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
      </div>
      <div className={styles.field}>
        <label>Birthdate <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          type="date"
          value={student.birthdate || ''}
          onChange={(e) => handleFieldChange('birthdate', e.target.value)}
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>Age <span className={styles.requiredDiamond}>*</span></label>
        <input
          {...intFieldProps('age')}
          readOnly={!!submission?.submitted_at}
        />
        {intErrorText('age')}
      </div>
      <div className={styles.field}>
        <label>Contact Number <span className={styles.requiredDiamond}>*</span></label>
        <input
          {...phoneFieldProps('contact_number')}
          readOnly={!!submission?.submitted_at}
        />
        {phoneErrorText('contact_number')}
      </div>
      <div className={styles.field}>
        <label>Email <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          type="email"
          value={student.email || ''}
          onChange={(e) => handleFieldChange('email', e.target.value)}
          placeholder="student@example.com"
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
        <label>Home Address <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          value={student.home_address || ''}
          onChange={(e) => handleFieldChange('home_address', e.target.value)}
          placeholder="Street, Barangay, City"
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>Grade Level <span className={styles.requiredDiamond}>*</span></label>
        <select
          className={styles.select}
          value={student.grade_level || ''}
          onChange={(e) => handleFieldChange('grade_level', e.target.value)}
          readOnly={!!submission?.submitted_at}
          style={{ width: '100%' }}
        >
          <option value="">Select</option>
          <option value="Grade 12">Grade 12</option>
        </select>
      </div>
      <div className={styles.field}>
        <label>Section <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          value={student.section || ''}
          onChange={(e) => handleFieldChange('section', e.target.value)}
          placeholder="A, B, C..."
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>Track & Strand <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          value={student.track_strand || ''}
          onChange={(e) => handleFieldChange('track_strand', e.target.value)}
          placeholder="STEM, ABM, HUMSS..."
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>School <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          value={student.school || ''}
          onChange={(e) => handleFieldChange('school', e.target.value)}
          placeholder="School name"
          readOnly={!!submission?.submitted_at}
        />
      </div>
    </div>
  );

  const renderGuardianForm = () => (
    <div className={styles.grid2}>
      <div className={styles.field}>
        <label>Preferred Industry <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          value={student.preferred_industry || ''}
          onChange={(e) => handleFieldChange('preferred_industry', e.target.value)}
          placeholder="e.g., Information Technology"
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>Preferred Company</label>
        <input
          className={styles.input}
          value={student.preferred_company || ''}
          onChange={(e) => handleFieldChange('preferred_company', e.target.value)}
          placeholder="e.g., ABC Corporation"
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
        <label>Career Goal <span className={styles.requiredDiamond}>*</span></label>
        <textarea
          className={styles.textarea}
          value={student.career_goal || ''}
          onChange={(e) => handleFieldChange('career_goal', e.target.value)}
          placeholder="Describe your career goal..."
          rows={3}
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
        <label>Why this Industry? <span className={styles.requiredDiamond}>*</span></label>
        <textarea
          className={styles.textarea}
          value={student.industry_reason || ''}
          onChange={(e) => handleFieldChange('industry_reason', e.target.value)}
          placeholder="Why are you interested in your preferred industry..."
          rows={3}
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>Guardian/Parent Name <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          value={student.guardian_name || ''}
          onChange={(e) => handleFieldChange('guardian_name', e.target.value)}
          placeholder="Full name"
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>Relationship <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          value={student.guardian_relationship || ''}
          onChange={(e) => handleFieldChange('guardian_relationship', e.target.value)}
          placeholder="e.g., Father"
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>Guardian Contact <span className={styles.requiredDiamond}>*</span></label>
        <input
          {...phoneFieldProps('guardian_contact')}
          readOnly={!!submission?.submitted_at}
        />
        {phoneErrorText('guardian_contact')}
      </div>
      <div className={styles.field}>
        <label>Guardian Email <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          type="email"
          value={student.guardian_email || ''}
          onChange={(e) => handleFieldChange('guardian_email', e.target.value)}
          placeholder="guardian@example.com"
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
        <label>Guardian Address <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          value={student.guardian_address || ''}
          onChange={(e) => handleFieldChange('guardian_address', e.target.value)}
          placeholder="Street, Barangay, City"
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>Emergency Contact Person <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          value={student.emergency_contact || ''}
          onChange={(e) => handleFieldChange('emergency_contact', e.target.value)}
          placeholder="Full name"
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>Emergency Contact Number <span className={styles.requiredDiamond}>*</span></label>
        <input
          {...phoneFieldProps('emergency_contact_number')}
          readOnly={!!submission?.submitted_at}
        />
        {phoneErrorText('emergency_contact_number')}
      </div>
    </div>
  );

  const renderMedicalDocs = () => {
    const items = docsBySection('medical');
    if (items.length === 0) {
      return <p className={styles.empty}>No medical documents configured.</p>;
    }
    return <div>{(items).map(renderDocItem)}</div>;
  };

  const renderAcademicDocs = () => {
    const items = docsBySection('academic');
    if (items.length === 0) {
      return <p className={styles.empty}>No academic documents configured.</p>;
    }
    return <div>{(items).map(renderDocItem)}</div>;
  };

  if (!data && !error) {
    return <p className={styles.loading}>Loading requirements...</p>;
  }

  const isSubmitted = ['Pending Review', 'Under Review', 'Approved'].includes(submission?.status) &&
    !!submission?.submitted_at;

  return (
    <div className={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700;800&display=swap');
      `}</style>

      <div className={styles.pageHeader}>
        <div className={styles.headerMain}>
          <div className={styles.eyebrow}>Student Portal</div>
          <h2>Requirements</h2>
          <p>Fill in your information and upload the required documents.</p>
        </div>
      </div>

      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <div className={styles.progressLabel}>
          <span><strong>Progress</strong> &mdash; {progress}% complete</span>
          <span>{uploadCount}/{docTypes.length} documents uploaded</span>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%`, background: progressColor }} />
        </div>
        {submission?.status && (
          <div className={styles.statusRow}>
            <span className={styles.muted}>Submission status:</span>
            <span className={`${styles.badge} ${styles.badgeReview}`}>{submission.status}</span>
            {submission?.submitted_at && (
              <span className={styles.muted}>
                Submitted on {new Date(submission.submitted_at).toLocaleDateString()}
              </span>
            )}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.tabs}>
          {Object.entries(SECTION_META).map(([key, { label, shortLabel }]) => {
            if (key === 'medical' || key === 'academic') {
              const sectionDone = sections[`${key}Complete`];
              const tabClass = `${styles.tab} ${activeTab === key ? styles.active : ''}`;
              const totalSectionDocs = docTypes.filter((d) => d.section === key).length;
              const uploadedSectionCodes = new Set(documents.map((d) => d.code));
              const uploadedSectionDocs = docTypes.filter((d) => d.section === key && uploadedSectionCodes.has(d.code)).length;
              const missing = totalSectionDocs - uploadedSectionDocs;
              const indicator = sectionDone
                ? '✓'
                : missing > 0
                  ? `${missing} missing`
                  : '';
              return (
                <button
                  key={key}
                  className={tabClass}
                  onClick={() => setActiveTab(key)}
                >
                  <span className={styles.tabLabelFull}>{label}</span>
                  <span className={styles.tabLabelShort}>{shortLabel}</span>
                  {indicator && (
                    <span
                      className={`${styles.tabFlag} ${sectionDone ? styles.tabFlagDone : styles.tabFlagMissing}`}
                    >
                      {indicator}
                    </span>
                  )}
                </button>
              );
            }
            return (
              <button
                key={key}
                className={`${styles.tab} ${activeTab === key ? styles.active : ''}`}
                onClick={() => setActiveTab(key)}
              >
                <span className={styles.tabLabelFull}>{label}</span>
                <span className={styles.tabLabelShort}>{shortLabel}</span>
              </button>
            );
          })}
        </div>

        {activeTab === 'personal' && renderPersonalForm()}
        {activeTab === 'guardian' && renderGuardianForm()}
        {activeTab === 'medical' && renderMedicalDocs()}
        {activeTab === 'academic' && renderAcademicDocs()}

        <div className={styles.saveBar}>
          <div className={styles.saveBarActions}>
            <button className={styles.submitBtn} disabled={submitting || isSubmitted} onClick={handleSubmit}>
              {isSubmitted ? 'Already Submitted' : submitting ? 'Submitting...' : 'Submit Requirements'}
            </button>
            <button className={styles.btn} disabled={saving || isSubmitted} onClick={handleSave}>
              {saving ? 'Saving...' : 'Save Progress'}
            </button>
          </div>
          {isSubmitted && (
            <p className={styles.muted}>
              Your requirements have been submitted for review. Contact your coordinator for changes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Requirements;
