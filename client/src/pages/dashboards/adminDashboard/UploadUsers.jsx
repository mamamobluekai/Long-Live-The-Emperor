import { useRef, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  Users,
  BriefcaseBusiness,
  ShieldCheck,
  FileText,
  Loader2,
  Trash2,
} from 'lucide-react';

import {
  uploadTeachersExcel,
  uploadSupervisorsExcel,
  uploadCoordinatorsExcel,
  getUploadTemplateUrl,
} from '../../../api/adminApi';
import { useToast } from '../../../components/admin/toastContext';
import styles from './UploadUsers.module.css';

const UPLOAD_TYPES = [
  {
    key: 'teachers',
    title: 'Teachers',
    icon: Users,
    description:
      'Add teaching staff in bulk. Each row creates a teacher account with the department and designation you provide.',
    required: ['Employee ID', 'First Name', 'Last Name', 'Email', 'Department', 'Position'],
    optional: ['Phone Number'],
    upload: uploadTeachersExcel,
  },
  {
    key: 'supervisors',
    title: 'Supervisors',
    icon: BriefcaseBusiness,
    description:
      'Add partner company supervisors in bulk, including the host company they represent.',
    required: [
      'Employee ID',
      'Company Name',
      'First Name',
      'Last Name',
      'Position',
      'Email',
    ],
    optional: ['Phone Number', 'Department'],
    upload: uploadSupervisorsExcel,
  },
  {
    key: 'coordinators',
    title: 'Coordinators',
    icon: ShieldCheck,
    description:
      'Add work immersion coordinators in bulk. New accounts stay pending until you approve them.',
    required: [
      'Coordinator ID',
      'First Name',
      'Last Name',
      'Email',
      'Department',
      'Position',
    ],
    optional: ['Phone Number'],
    upload: uploadCoordinatorsExcel,
  },
];

const EMPTY_STATE = {
  file: null,
  loading: false,
  message: '',
  success: 0,
  failed: 0,
  errors: [],
};

function UploadCard({ config, state, onSelectFile, onClear, onUpload }) {
  const inputRef = useRef(null);
  const Icon = config.icon;

  const openPicker = () => inputRef.current?.click();

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardIcon}>
          <Icon size={18} />
        </div>

        <div className={styles.cardHeading}>
          <h3>{config.title}</h3>
          <p>{config.description}</p>
        </div>

        <button
          type="button"
          className={styles.templateBtn}
          onClick={() =>
            window.open(getUploadTemplateUrl(config.key), '_blank')
          }
          title={`Download the ${config.title.toLowerCase()} Excel template`}
        >
          <Download size={16} />
          Template
        </button>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.columnsBlock}>
          <span className={styles.columnsLabel}>
            <FileSpreadsheet size={15} />
            Required columns
          </span>

          <div className={styles.chips}>
            {config.required.map((column) => (
              <span key={column} className={styles.chipRequired}>
                {column}
              </span>
            ))}

            {config.optional.map((column) => (
              <span key={column} className={styles.chipOptional}>
                {column}
              </span>
            ))}
          </div>
        </div>

        {state.file ? (
          <div className={styles.fileBox}>
            <div className={styles.fileInfo}>
              <FileText size={18} />

              <div>
                <strong>{state.file.name}</strong>
                <span>
                  {(state.file.size / 1024).toFixed(1)} KB • Excel workbook
                </span>
              </div>
            </div>

            <button
              type="button"
              className={styles.clearFileBtn}
              onClick={onClear}
              disabled={state.loading}
              aria-label="Remove selected file"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.dropzone}
            onClick={openPicker}
          >
            <Upload size={22} />
            <strong>Choose an Excel file</strong>
            <span>.xlsx or .xls • first sheet is read</span>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className={styles.hiddenInput}
          onChange={(e) => onSelectFile(e.target.files?.[0] || null)}
        />

        <div className={styles.cardFooter}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onUpload}
            disabled={!state.file || state.loading}
          >
            {state.loading ? (
              <Loader2 size={16} className={styles.spin} />
            ) : (
              <Upload size={16} />
            )}
            {state.loading
              ? 'Uploading...'
              : `Upload ${config.title.toLowerCase()}`}
          </button>

          {state.message ? (
            <span className={styles.resultSummary}>
              {state.message}
            </span>
          ) : (
            <span className={styles.resultHint}>
              Accounts are created as pending after a successful upload.
            </span>
          )}
        </div>

        {state.errors.length > 0 && (
          <div className={styles.errorList}>
            <div className={styles.errorListHeader}>
              <AlertCircle size={15} />
              {state.failed} row{state.failed === 1 ? '' : 's'} could not be
              imported
            </div>

            <ul>
              {state.errors.map((item, index) => (
                <li key={`${item.row}-${index}`}>
                  <span className={styles.errorRow}>Row {item.row}</span>
                  {item.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {state.success > 0 && state.errors.length === 0 && (
          <div className={styles.successNote}>
            <CheckCircle2 size={16} />
            {state.success} account{state.success === 1 ? '' : 's'} created
            successfully.
          </div>
        )}
      </div>
    </section>
  );
}

export default function UploadUsers() {
  const { showToast } = useToast();

  const [states, setStates] = useState(() =>
    Object.fromEntries(
      UPLOAD_TYPES.map((config) => [config.key, { ...EMPTY_STATE }]),
    ),
  );

  const configFor = (key) =>
    UPLOAD_TYPES.find((config) => config.key === key);

  const handleSelectFile = (key, file) => {
    setStates((prev) => ({
      ...prev,
      [key]: { ...prev[key], file, message: '', errors: [], success: 0, failed: 0 },
    }));
  };

  const handleClearFile = (key) => {
    setStates((prev) => ({
      ...prev,
      [key]: { ...EMPTY_STATE },
    }));
  };

  const handleUpload = async (key) => {
    const config = configFor(key);
    const file = states[key].file;

    if (!file) return;

    setStates((prev) => ({
      ...prev,
      [key]: { ...prev[key], loading: true, message: '', errors: [] },
    }));

    try {
      const data = await config.upload(file);
      const results = data?.results || {};

      setStates((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          loading: false,
          file: null,
          message: data.message || 'Upload complete.',
          success: Number(results.success) || 0,
          failed: Number(results.failed) || 0,
          errors: results.errors || [],
        },
      }));

      showToast(data.message || 'Upload complete.', 'success');
    } catch (err) {
      setStates((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          loading: false,
          message: '',
          errors: [{ row: '-', error: err.message }],
          failed: 1,
        },
      }));

      showToast(err.message, 'error');
    }
  };

  const handleRemoveResult = (key) => {
    setStates((prev) => ({ ...prev, [key]: { ...EMPTY_STATE } }));
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Bulk Registration</span>

          <h1>Upload Users</h1>

          <p>
            Import teachers, supervisors, and coordinators in bulk from an Excel
            workbook. Download the template for each role to get the exact
            columns, a sample row, and a read-me sheet.
          </p>
        </div>

        <div className={styles.headerIcon}>
          <FileSpreadsheet size={24} />
        </div>
      </div>

      <div className={styles.guideCard}>
        <div className={styles.guideIcon}>
          <FileText size={20} />
        </div>

        <div>
          <h3>Before you upload</h3>

          <ul>
            <li>Use the provided template so every column is recognized.</li>
            <li>Only the first sheet of the workbook is read.</li>
            <li>Emails and employee IDs must be unique across the system.</li>
            <li>Duplicate or invalid rows are skipped and reported below the card.</li>
          </ul>
        </div>
      </div>

      <div className={styles.cardList}>
        {UPLOAD_TYPES.map((config) => (
          <UploadCard
            key={config.key}
            config={config}
            state={states[config.key]}
            onSelectFile={(file) => handleSelectFile(config.key, file)}
            onClear={() => handleClearFile(config.key)}
            onUpload={() => handleUpload(config.key)}
          />
        ))}
      </div>

      {UPLOAD_TYPES.some((config) => states[config.key].message) && (
        <button
          type="button"
          className={styles.clearResultsBtn}
          onClick={() => UPLOAD_TYPES.forEach((c) => handleRemoveResult(c.key))}
        >
          <Trash2 size={16} />
          Clear upload results
        </button>
      )}
    </div>
  );
}
