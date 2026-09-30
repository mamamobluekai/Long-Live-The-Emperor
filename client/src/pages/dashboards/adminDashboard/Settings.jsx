import { useEffect, useState, useCallback } from 'react';
import {
  getAdminSettings,
  getImmersionPeriods,
  createImmersionPeriod,
  updateImmersionPeriod,
  deleteImmersionPeriod,
  previewPeriodArchive,
  archiveImmersionPeriod,
} from '../../../api/adminApi';
import {
  Archive,
  CircleCheck,
  Pencil,
  Plus,
  Settings as SettingsIcon,
  TriangleAlert,
  Wrench,
  X,
} from 'lucide-react';
import { useToast } from '../../../components/admin/toastContext';
import ConfirmModal from '../../../components/admin/ConfirmModal';
import { setMaintenanceMode } from '../../../api/maintenanceApi';
import { useMaintenance } from '../../../context/maintenanceContextValue';
import styles from './Settings.module.css';

const ACADEMIC_YEAR_OPTIONS = ['2025-2026', '2026-2027', '2027-2028'];
const SEMESTER_OPTIONS = ['1st Semester', '2nd Semester', 'Summer'];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function computeStatus(startDate, endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (!start || !end) return 'inactive';
  if (today < start) return 'upcoming';
  if (today > end) return 'completed';
  return 'ongoing';
}

// Converts a stored timestamp into the format a datetime-local input expects.
function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function SettingsPage() {
  const { showToast } = useToast();
  const { status: maintenance, report: reportMaintenance } = useMaintenance();
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({ message: '', estimatedEnd: '' });
  const [maintenanceModal, setMaintenanceModal] = useState(false);
  const [loading, setLoading] = useState(true);
  // Only the fields the period editor uses as defaults are kept from settings.
  const [form, setForm] = useState({});

  const [periods, setPeriods] = useState([]);
  const [periodForm, setPeriodForm] = useState({
    period_name: '',
    academic_year: '2026-2027',
    semester: '1st Semester',
    start_date: '',
    end_date: '',
    required_hours: 80,
    working_days: 'Mon,Tue,Wed,Thu,Fri',
    is_active: true,
  });
  const [periodEditing, setPeriodEditing] = useState(null);
  const [periodModal, setPeriodModal] = useState(false);
  const [deletePeriodModal, setDeletePeriodModal] = useState({ open: false, id: null, name: '' });
  const [archiveModal, setArchiveModal] = useState({ open: false, period: null, preview: null, loading: false, error: '' });
  const [archiving, setArchiving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await getAdminSettings();
      const s = data.settings || {};
      setForm({
        academic_year: s.academic_year || '',
        semester: s.semester || '',
        immersion_start_date: s.immersion_start_date || '',
        immersion_end_date: s.immersion_end_date || '',
        required_hours: s.required_hours || 80,
        working_days: s.working_days || 'Mon,Tue,Wed,Thu,Fri',
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [showToast]);

  const loadPeriods = useCallback(async () => {
    try {
      const data = await getImmersionPeriods();
      setPeriods(data.periods || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadSettings(), loadPeriods()]);
      setLoading(false);
    };
    init();
  }, [loadSettings, loadPeriods]);

  const handlePeriodChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPeriodForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const openPeriodModal = (period = null) => {
    if (period) {
      setPeriodEditing(period.id);
      setPeriodForm({
        period_name: period.period_name || '',
        academic_year: period.academic_year || '2026-2027',
        semester: period.semester || '1st Semester',
        start_date: period.start_date || '',
        end_date: period.end_date || '',
        required_hours: period.required_hours || 80,
        working_days: period.working_days || 'Mon,Tue,Wed,Thu,Fri',
        is_active: period.is_active ?? true,
      });
    } else {
      setPeriodEditing(null);
      setPeriodForm({
        period_name: '',
        academic_year: form.academic_year || '2026-2027',
        semester: form.semester || '1st Semester',
        start_date: form.immersion_start_date || '',
        end_date: form.immersion_end_date || '',
        required_hours: form.required_hours || 80,
        working_days: form.working_days || 'Mon,Tue,Wed,Thu,Fri',
        is_active: true,
      });
    }
    setPeriodModal(true);
  };

  const handlePeriodSubmit = async (e) => {
    e.preventDefault();
    try {
      if (periodEditing) {
        await updateImmersionPeriod(periodEditing, periodForm);
        showToast('Immersion period updated.', 'success');
      } else {
        await createImmersionPeriod(periodForm);
        showToast('Immersion period created.', 'success');
      }
      setPeriodModal(false);
      loadPeriods();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeletePeriod = async () => {
    try {
      await deleteImmersionPeriod(deletePeriodModal.id);
      showToast('Immersion period deleted.', 'success');
      setDeletePeriodModal({ open: false, id: null, name: '' });
      loadPeriods();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openArchiveModal = async (period) => {
    setArchiveModal({ open: true, period, preview: null, loading: true, error: '' });
    try {
      const data = await previewPeriodArchive(period.id);
      setArchiveModal((m) => ({ ...m, preview: data.preview, loading: false }));
    } catch (err) {
      setArchiveModal((m) => ({ ...m, loading: false, error: err.message }));
    }
  };

  const closeArchiveModal = () => {
    if (archiving) return;
    setArchiveModal({ open: false, period: null, preview: null, loading: false, error: '' });
  };

  const handleArchivePeriod = async () => {
    if (!archiveModal.period) return;
    setArchiving(true);
    try {
      await archiveImmersionPeriod(archiveModal.period.id);
      showToast('Period archived. View it in Archived Periods.', 'success');
      setArchiving(false);
      closeArchiveModal();
      loadPeriods();
    } catch (err) {
      showToast(err.message, 'error');
      setArchiving(false);
    }
  };

  // Tones map onto the shared status-badge palette in the CSS module.
  const statusConfig = {
    upcoming: { label: 'Upcoming', tone: 'upcoming' },
    ongoing: { label: 'Ongoing', tone: 'ongoing' },
    completed: { label: 'Completed', tone: 'completed' },
    inactive: { label: 'Inactive', tone: 'inactive' },
  };

  const openMaintenanceModal = () => {
    setMaintenanceForm({
      message: maintenance.message || '',
      // datetime-local needs "YYYY-MM-DDTHH:mm", not an ISO string with a Z.
      estimatedEnd: toLocalInput(maintenance.estimatedEnd),
    });
    setMaintenanceModal(true);
  };

  const toggleMaintenance = async () => {
    const enabling = !maintenance.enabled;
    setMaintenanceSaving(true);
    try {
      const next = await setMaintenanceMode({
        enabled: enabling,
        message: maintenanceForm.message.trim() || null,
        estimatedEnd: maintenanceForm.estimatedEnd ? new Date(maintenanceForm.estimatedEnd).toISOString() : null,
      });
      // Push into the app-wide context so other tabs/views react immediately.
      reportMaintenance(next);
      showToast(enabling ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.', 'success');
      setMaintenanceModal(false);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setMaintenanceSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <span className={styles.spinner} aria-hidden="true" />
          Loading settings…
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.headerIdentity}>
          <span className={styles.headerIcon} aria-hidden="true">
            <SettingsIcon size={24} strokeWidth={1.9} />
          </span>
          <div>
            <p className={styles.eyebrow}>CONFIGURATION</p>
            <h1 className={styles.title}>System Settings</h1>
            <p className={styles.subtitle}>
              Manage the work immersion periods that drive each batch schedule. Changes here apply
              across every role in the Work Immersion System.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Immersion Periods</h2>
            <p className={styles.sectionSubtitle}>
              Create and manage the immersion periods that define each batch schedule.
            </p>
          </div>
          <button type="button" className={styles.addBtn} onClick={() => openPeriodModal()}>
            <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
            Add Immersion Period
          </button>
        </div>

        <div className={styles.periodsTable}>
          <div className={styles.periodsHeader}>
            <span>Period</span>
            <span>Start Date</span>
            <span>End Date</span>
            <span>Status</span>
            <span>Batches</span>
            <span>Actions</span>
          </div>
          {periods.length > 0 ? (
            periods.map((period) => {
              const pStatus = computeStatus(period.start_date, period.end_date);
              const pStatusInfo = statusConfig[pStatus];
              return (
                <div key={period.id} className={styles.periodRow}>
                  <div className={styles.periodName}>
                    <strong>{period.period_name}</strong>
                    <span className={styles.periodMeta}>{period.academic_year} - {period.semester}</span>
                  </div>
                  <span>{formatDate(period.start_date)}</span>
                  <span>{formatDate(period.end_date)}</span>
                  <span>
                    <span className={`${styles.periodStatusBadge} ${styles[pStatusInfo.tone]}`}>
                      {pStatusInfo.label}
                    </span>
                  </span>
                  <span>{period.batch_count || 0}</span>
                  <div className={styles.periodActions}>
                    <button
                      type="button"
                      className={styles.periodEditBtn}
                      onClick={() => openPeriodModal(period)}
                    >
                      <Pencil size={12} strokeWidth={2} aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.periodArchiveBtn}
                      onClick={() => openArchiveModal(period)}
                      title="Snapshot this period and remove its live data. Snapshot is viewable in Archived Periods."
                    >
                      <Archive size={12} strokeWidth={2} aria-hidden="true" />
                      Archive
                    </button>
                    <button
                      type="button"
                      className={styles.periodDeleteBtn}
                      onClick={() => setDeletePeriodModal({ open: true, id: period.id, name: period.period_name })}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className={styles.emptyPeriods}>
              <p>No immersion periods created yet.</p>
              <button type="button" className={styles.addBtn} onClick={() => openPeriodModal()}>
                <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
                Add First Period
              </button>
            </div>
          )}
        </div>
      </div>

      <section
        className={`${styles.maintCard} ${maintenance.enabled ? styles.maintCardOn : ''}`}
        aria-labelledby="maintenance-section-title"
      >
        <div className={styles.maintHeader}>
          <div className={styles.maintIdentity}>
            <span className={styles.maintIcon} aria-hidden="true">
              <Wrench size={19} strokeWidth={1.9} />
            </span>
            <div>
              <h2 id="maintenance-section-title" className={styles.maintTitle}>
                Maintenance Mode
              </h2>
              <p className={styles.maintSubtitle}>
                Temporarily block students, teachers, supervisors and coordinators while you carry
                out system work. Admins stay signed in so you can always switch it back off.
              </p>
            </div>
          </div>

          <span className={`${styles.maintBadge} ${maintenance.enabled ? styles.maintBadgeOn : styles.maintBadgeOff}`}>
            {maintenance.enabled ? <TriangleAlert size={13} strokeWidth={2} /> : <CircleCheck size={13} strokeWidth={2} />}
            {maintenance.enabled ? 'On' : 'Off'}
          </span>
        </div>

        {maintenance.enabled ? (
          <div className={styles.maintNotice}>
            <strong>Maintenance mode is active.</strong>
            {maintenance.message}
          </div>
        ) : (
          <p className={styles.maintIdle}>The system is available to all users.</p>
        )}

        <div className={styles.maintActions}>
          <button
            type="button"
            className={maintenance.enabled ? styles.maintStopBtn : styles.maintStartBtn}
            onClick={openMaintenanceModal}
          >
            {maintenance.enabled ? (
              <>
                <CircleCheck size={15} strokeWidth={2} aria-hidden="true" />
                Turn off maintenance
              </>
            ) : (
              <>
                <Wrench size={15} strokeWidth={2} aria-hidden="true" />
                Enable maintenance mode
              </>
            )}
          </button>
        </div>
      </section>

      {maintenanceModal && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="maintenance-modal-title"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setMaintenanceModal(false); }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3 id="maintenance-modal-title">
                {maintenance.enabled ? 'Turn off maintenance mode' : 'Enable maintenance mode'}
              </h3>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setMaintenanceModal(false)}
                aria-label="Close"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className={styles.modalForm}>
              {maintenance.enabled ? (
                <p className={styles.maintIntro}>
                  Everyone except admins will be able to use the system again as soon as you
                  confirm.
                </p>
              ) : (
                <>
                  <p className={styles.maintIntro}>
                    All student, teacher, supervisor and coordinator accounts will be signed out and
                    blocked from signing in until you turn this off. Admin accounts are not affected.
                  </p>

                  <div className={styles.fieldFull}>
                    <label htmlFor="maintenance_message">Reason shown to users</label>
                    <textarea
                      id="maintenance_message"
                      rows={3}
                      value={maintenanceForm.message}
                      onChange={(e) => setMaintenanceForm((f) => ({ ...f, message: e.target.value }))}
                      placeholder="e.g. Scheduled database upgrade. Please check back shortly."
                    />
                  </div>

                  <div className={styles.fieldFull}>
                    <label htmlFor="maintenance_estimated_end">Expected back by (optional)</label>
                    <input
                      id="maintenance_estimated_end"
                      type="datetime-local"
                      value={maintenanceForm.estimatedEnd}
                      onChange={(e) => setMaintenanceForm((f) => ({ ...f, estimatedEnd: e.target.value }))}
                    />
                  </div>
                </>
              )}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setMaintenanceModal(false)}
                  disabled={maintenanceSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={maintenance.enabled ? styles.maintStopBtn : styles.archiveConfirmBtn}
                  onClick={toggleMaintenance}
                  disabled={maintenanceSaving}
                >
                  {maintenanceSaving
                    ? 'Saving…'
                    : maintenance.enabled
                      ? 'Turn off maintenance'
                      : 'Enable maintenance mode'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {periodModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>{periodEditing ? 'Edit Immersion Period' : 'Add Immersion Period'}</h3>
              <button type="button" className={styles.modalClose} onClick={() => setPeriodModal(false)} aria-label="Close">
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <form onSubmit={handlePeriodSubmit} className={styles.modalForm}>
              <div className={styles.grid}>
                <div className={styles.fieldFull}>
                  <label htmlFor="period_name">Period Name</label>
                  <input
                    id="period_name"
                    name="period_name"
                    value={periodForm.period_name}
                    onChange={handlePeriodChange}
                    placeholder="e.g. Batch 2027-A"
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="period_academic_year">Academic Year</label>
                  <select id="period_academic_year" name="academic_year" value={periodForm.academic_year} onChange={handlePeriodChange}>
                    {ACADEMIC_YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="period_semester">Semester</label>
                  <select id="period_semester" name="semester" value={periodForm.semester} onChange={handlePeriodChange}>
                    {SEMESTER_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="period_start_date">Start Date</label>
                  <input
                    id="period_start_date"
                    name="start_date"
                    type="date"
                    value={periodForm.start_date}
                    onChange={handlePeriodChange}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="period_end_date">End Date</label>
                  <input
                    id="period_end_date"
                    name="end_date"
                    type="date"
                    value={periodForm.end_date}
                    onChange={handlePeriodChange}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="period_required_hours">Required Hours</label>
                  <input
                    id="period_required_hours"
                    name="required_hours"
                    type="number"
                    min="1"
                    value={periodForm.required_hours}
                    onChange={handlePeriodChange}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="period_working_days">Working Days</label>
                  <input
                    id="period_working_days"
                    name="working_days"
                    value={periodForm.working_days}
                    onChange={handlePeriodChange}
                    placeholder="Mon,Tue,Wed,Thu,Fri"
                  />
                </div>
              </div>
              <label className={styles.toggleItem}>
                <input
                  type="checkbox"
                  name="is_active"
                  checked={periodForm.is_active}
                  onChange={handlePeriodChange}
                />
                <span className={styles.toggleLabel}>Active</span>
              </label>
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setPeriodModal(false)}>Cancel</button>
                <button type="submit" className={styles.saveBtn}>{periodEditing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deletePeriodModal.open}
        title="Delete Immersion Period"
        message={`Are you sure you want to delete "${deletePeriodModal.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isDestructive
        onConfirm={handleDeletePeriod}
        onClose={() => setDeletePeriodModal({ open: false, id: null, name: '' })}
      />

      {archiveModal.open && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>Archive Immersion Period</h3>
              <button type="button" className={styles.modalClose} onClick={closeArchiveModal} disabled={archiving} aria-label="Close">
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className={styles.modalForm}>
              <p className={styles.archiveIntro}>
                <strong>{archiveModal.period?.period_name}</strong> will be snapshotted into the
                archive. All student, teacher, supervisor, and coordinator accounts linked to this
                period (directly or via its batches) will be <strong>deleted</strong> along with
                their attendance, GPS logs, appeals, evaluations, certificates, deployment
                requests, and documents.
              </p>
              {archiveModal.loading ? (
                <p className={styles.muted}>Loading snapshot preview…</p>
              ) : archiveModal.error ? (
                <p className={styles.error}>{archiveModal.error}</p>
              ) : archiveModal.preview?.alreadyArchived ? (
                <p className={styles.error}>This period has already been archived.</p>
              ) : archiveModal.preview ? (
                <div className={styles.archiveSummary}>
                  <div className={styles.archiveStat}><span>Students</span><strong>{archiveModal.preview.counts.students}</strong></div>
                  <div className={styles.archiveStat}><span>Teachers</span><strong>{archiveModal.preview.counts.teachers}</strong></div>
                  <div className={styles.archiveStat}><span>Supervisors</span><strong>{archiveModal.preview.counts.supervisors}</strong></div>
                  <div className={styles.archiveStat}><span>Coordinators</span><strong>{archiveModal.preview.counts.coordinators}</strong></div>
                  <div className={styles.archiveStat}><span>Batches</span><strong>{archiveModal.preview.counts.batches}</strong></div>
                </div>
              ) : null}
              <p className={styles.archiveWarning}>
                This cannot be undone. The original data is removed; only the archive snapshot remains.
              </p>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={closeArchiveModal}
                  disabled={archiving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.archiveConfirmBtn}
                  onClick={handleArchivePeriod}
                  disabled={archiving || archiveModal.loading || !!archiveModal.error || !!archiveModal.preview?.alreadyArchived}
                >
                  {archiving ? 'Archiving…' : 'Archive period'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
