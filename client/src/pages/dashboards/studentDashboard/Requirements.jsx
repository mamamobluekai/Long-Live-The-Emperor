import { useEffect, useState, useCallback } from 'react';
import {
  getMyRequirements,
  updateMyRequirements,
  submitMyRequirements,
  uploadMyDocument,
  deleteMyDocument,
  documentFileUrl,
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

const ALL_DOCS = [
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

function Requirements({ user }) {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('personal');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(null);
  const [uploadFile, setUploadFile] = useState({});
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setError('');
    setMessage('');
    try {
      const result = await getMyRequirements();
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    load();
    return () => { mounted = false; };
  }, [load]);

  const student = data?.student || {};
  const submission = data?.submission || {};
  const documents = data?.documents || [];
  const progress = data?.progress ?? 0;
  const sections = data?.sections || {};

  const uploadCount = ALL_DOCS.filter((d) =>
    documents.some((sd) => sd.code === d.code)
  ).length;

  const progressColor = progress >= 100 ? '#22c55e' : progress >= 50 ? '#3b82f6' : '#f59e0b';

  const handleFieldChange = (field, value) => {
    setData((prev) => ({
      ...prev,
      student: { ...prev.student, [field]: value },
    }));
  };

  const handleSave = async () => {
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
        missingDocuments: ALL_DOCS.map((d) => d.code),
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
    return ALL_DOCS.filter((d) => d.section === section).map((type) => ({
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
              {doc.file_path && (
                <a
                  className={styles.btnGhost}
                  href={documentFileUrl(doc.file_path)}
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
          className={styles.input}
          value={student.student_number || ''}
          onChange={(e) => handleFieldChange('student_number', e.target.value)}
          placeholder="e.g., 2024-001"
          readOnly={!!submission?.submitted_at}
        />
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
          className={styles.input}
          type="number"
          min="0"
          value={student.age ?? ''}
          onChange={(e) => handleFieldChange('age', e.target.value)}
          placeholder="18"
          readOnly={!!submission?.submitted_at}
        />
      </div>
      <div className={styles.field}>
        <label>Contact Number <span className={styles.requiredDiamond}>*</span></label>
        <input
          className={styles.input}
          value={student.contact_number || ''}
          onChange={(e) => handleFieldChange('contact_number', e.target.value)}
          placeholder="09xxxxxxxxx"
          readOnly={!!submission?.submitted_at}
        />
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
          <option value="Grade 11">Grade 11</option>
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
          className={styles.input}
          value={student.guardian_contact || ''}
          onChange={(e) => handleFieldChange('guardian_contact', e.target.value)}
          placeholder="09xxxxxxxxx"
          readOnly={!!submission?.submitted_at}
        />
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
          className={styles.input}
          value={student.emergency_contact_number || ''}
          onChange={(e) => handleFieldChange('emergency_contact_number', e.target.value)}
          placeholder="09xxxxxxxxx"
          readOnly={!!submission?.submitted_at}
        />
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
    <div>
      <div className={styles.pageHeader}>
        <h2>Requirements</h2>
        <p>Fill in your information and upload the required documents.</p>
      </div>

      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <div className={styles.progressLabel}>
          <span><strong>Progress</strong> &mdash; {progress}% complete</span>
          <span>{uploadCount}/{ALL_DOCS.length} documents uploaded</span>
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
          {Object.entries(SECTION_META).map(([key, { label }]) => {
            if (key === 'medical' || key === 'academic') {
              const sectionDone = sections[`${key}Complete`];
              const tabClass = `${styles.tab} ${activeTab === key ? styles.active : ''}`;
              const totalSectionDocs = ALL_DOCS.filter((d) => d.section === key).length;
              const uploadedSectionCodes = new Set(documents.map((d) => d.code));
              const uploadedSectionDocs = ALL_DOCS.filter((d) => d.section === key && uploadedSectionCodes.has(d.code)).length;
              const indicator = sectionDone
                ? ' ✓'
                : ` (${totalSectionDocs - uploadedSectionDocs} missing)`;
              return (
                <button
                  key={key}
                  className={tabClass}
                  onClick={() => setActiveTab(key)}
                >
                  {label}
                  <span style={{ color: !sectionDone ? '#ef4444' : '#22c55e', marginLeft: 4, fontSize: '0.75rem' }}>
                    {indicator}
                  </span>
                </button>
              );
            }
            return (
              <button
                key={key}
                className={`${styles.tab} ${activeTab === key ? styles.active : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            );
          })}
        </div>

        {activeTab === 'personal' && renderPersonalForm()}
        {activeTab === 'guardian' && renderGuardianForm()}
        {activeTab === 'medical' && renderMedicalDocs()}
        {activeTab === 'academic' && renderAcademicDocs()}

        <div className={styles.saveBar}>
          <button className={styles.submitBtn} disabled={submitting || isSubmitted} onClick={handleSubmit}>
            {isSubmitted ? 'Already Submitted' : submitting ? 'Submitting...' : 'Submit Requirements'}
          </button>
          <button className={styles.btn} disabled={saving || isSubmitted} onClick={handleSave}>
            {saving ? 'Saving...' : 'Save Progress'}
          </button>
          {isSubmitted && (
            <span className={styles.muted}>
              Your requirements have been submitted for review. Contact your coordinator for changes.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default Requirements;
