import { useEffect, useState, useCallback } from 'react';
import {
  getAdminSettings,
  updateAdminSettings,
  uploadLogo,
  getImmersionPeriods,
  createImmersionPeriod,
  updateImmersionPeriod,
  deleteImmersionPeriod,
  previewPeriodArchive,
  archiveImmersionPeriod,
} from '../../../api/adminApi';
import { useToast } from '../../../components/admin/toastContext';
import ConfirmModal from '../../../components/admin/ConfirmModal';
import styles from './Settings.module.css';

const ACADEMIC_YEAR_OPTIONS = ['2025-2026', '2026-2027', '2027-2028'];
const SEMESTER_OPTIONS = ['1st Semester', '2nd Semester', 'Summer'];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  return diff;
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

export default function SettingsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [form, setForm] = useState({});
  const [preview, setPreview] = useState('');
  const [activeTab, setActiveTab] = useState('immersion');

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
        system_name: s.system_name || '',
        school_name: s.school_name || '',
        school_address: s.school_address || '',
        academic_year: s.academic_year || '',
        semester: s.semester || '',
        attendance_time_in: s.attendance_time_in || '',
        attendance_time_out: s.attendance_time_out || '',
        announcements: s.announcements || '',
        immersion_start_date: s.immersion_start_date || '',
        immersion_end_date: s.immersion_end_date || '',
        auto_activate: s.auto_activate ?? true,
        auto_deactivate: s.auto_deactivate ?? true,
        access_student: s.access_student ?? true,
        access_teacher: s.access_teacher ?? true,
        access_coordinator: s.access_coordinator ?? true,
        access_supervisor: s.access_supervisor ?? true,
        required_hours: s.required_hours || 80,
        working_days: s.working_days || 'Mon,Tue,Wed,Thu,Fri',
      });
      setPreview(s.logo_url || '');
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

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const data = await uploadLogo(file);
      const url = data.logoUrl;
      setPreview(url);
      setForm((prev) => ({ ...prev, logo_url: url }));
      showToast('Logo uploaded successfully.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLogoUploading(false);
    }
  };

  const saveSettings = async (payload) => {
    setSaving(true);
    try {
      await updateAdminSettings(payload);
      showToast('Settings saved.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveSettings(form);
  };

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

  const activePeriod = (periods || []).find((p) => p.is_active) || (periods || [])[0] || null;
  const periodStart = activePeriod?.start_date || '';
  const periodEnd = activePeriod?.end_date || '';
  const statusStart = periodStart || form.immersion_start_date || '';
  const statusEnd = periodEnd || form.immersion_end_date || '';

  const immersionStatus = computeStatus(statusStart, statusEnd);
  const daysUntil = getDaysUntil(statusStart);

  const statusConfig = {
    upcoming: { label: 'Upcoming', color: '#f59e0b', icon: '🟡' },
    ongoing: { label: 'Ongoing', color: '#22c55e', icon: '🟢' },
    completed: { label: 'Completed', color: '#64748b', icon: '⚫' },
    inactive: { label: 'Inactive', color: '#94a3b8', icon: '⚪' },
  };

  const statusInfo = statusConfig[immersionStatus];

  if (loading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>System Settings</h1>
        <p>Loading settings…</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>System Settings</h1>
          <p className={styles.subtitle}>Configure system-wide settings and work immersion schedule</p>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'immersion' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('immersion')}
          type="button"
        >
          Work Immersion
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'periods' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('periods')}
          type="button"
        >
          Immersion Periods
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'general' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('general')}
          type="button"
        >
          General
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'attendance' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('attendance')}
          type="button"
        >
          Attendance
        </button>
      </div>

      {activeTab === 'immersion' && (
        <div className={styles.section}>
          <div className={styles.statusCard}>
            <div className={styles.statusHeader}>
              <h3 className={styles.statusTitle}>Work Immersion Status</h3>
              <span className={styles.statusBadge} style={{ background: statusInfo.color }}>
                {statusInfo.icon} {statusInfo.label}
              </span>
            </div>
            {statusStart && statusEnd ? (
              <>
                <p className={styles.statusDates}>
                  {formatDate(statusStart)} – {formatDate(statusEnd)}
                </p>
                {activePeriod && (
                  <p className={styles.statusCountdown}>
                    {activePeriod.period_name} ({activePeriod.academic_year} · {activePeriod.semester})
                  </p>
                )}
                {immersionStatus === 'upcoming' && daysUntil !== null && (
                  <p className={styles.statusCountdown}>Starts in: {daysUntil} day{daysUntil !== 1 ? 's' : ''}</p>
                )}
                {immersionStatus === 'ongoing' && (
                  <p className={styles.statusCountdown}>Immersion is currently active</p>
                )}
              </>
            ) : (
              <p className={styles.statusEmpty}>No immersion dates set. Configure the schedule below.</p>
            )}
            <button type="button" className={styles.editScheduleBtn} onClick={() => setActiveTab('periods')}>
              Edit Schedule
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Work Immersion Schedule</h3>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label htmlFor="academic_year">Academic Year</label>
                  <select id="academic_year" name="academic_year" value={form.academic_year || ''} onChange={handleChange}>
                    <option value="">Select Academic Year</option>
                    {ACADEMIC_YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="semester">Semester</label>
                  <select id="semester" name="semester" value={form.semester || ''} onChange={handleChange}>
                    <option value="">Select Semester</option>
                    {SEMESTER_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="immersion_start_date">Immersion Start Date</label>
                  <input
                    id="immersion_start_date"
                    name="immersion_start_date"
                    type="date"
                    value={form.immersion_start_date || ''}
                    onChange={handleChange}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="immersion_end_date">Immersion End Date</label>
                  <input
                    id="immersion_end_date"
                    name="immersion_end_date"
                    type="date"
                    value={form.immersion_end_date || ''}
                    onChange={handleChange}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="required_hours">Required Immersion Hours</label>
                  <input
                    id="required_hours"
                    name="required_hours"
                    type="number"
                    min="1"
                    value={form.required_hours || 80}
                    onChange={handleChange}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="working_days">Working Days</label>
                  <input
                    id="working_days"
                    name="working_days"
                    value={form.working_days || ''}
                    onChange={handleChange}
                    placeholder="Mon,Tue,Wed,Thu,Fri"
                  />
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Automatic System Access</h3>
              <p className={styles.cardDescription}>
                Control when non-admin users can access immersion features based on the schedule.
              </p>
              <div className={styles.toggleGrid}>
                <label className={styles.toggleItem}>
                  <input
                    type="checkbox"
                    name="auto_activate"
                    checked={form.auto_activate ?? true}
                    onChange={handleChange}
                  />
                  <span className={styles.toggleLabel}>Automatically open system on start date</span>
                </label>
                <label className={styles.toggleItem}>
                  <input
                    type="checkbox"
                    name="auto_deactivate"
                    checked={form.auto_deactivate ?? true}
                    onChange={handleChange}
                  />
                  <span className={styles.toggleLabel}>Automatically close system on end date</span>
                </label>
              </div>

              <h4 className={styles.toggleSectionTitle}>Access during immersion</h4>
              <div className={styles.toggleGrid}>
                <label className={styles.toggleItem}>
                  <input
                    type="checkbox"
                    name="access_student"
                    checked={form.access_student ?? true}
                    onChange={handleChange}
                  />
                  <span className={styles.toggleLabel}>Student</span>
                </label>
                <label className={styles.toggleItem}>
                  <input
                    type="checkbox"
                    name="access_teacher"
                    checked={form.access_teacher ?? true}
                    onChange={handleChange}
                  />
                  <span className={styles.toggleLabel}>Teacher</span>
                </label>
                <label className={styles.toggleItem}>
                  <input
                    type="checkbox"
                    name="access_coordinator"
                    checked={form.access_coordinator ?? true}
                    onChange={handleChange}
                  />
                  <span className={styles.toggleLabel}>Coordinator</span>
                </label>
                <label className={styles.toggleItem}>
                  <input
                    type="checkbox"
                    name="access_supervisor"
                    checked={form.access_supervisor ?? true}
                    onChange={handleChange}
                  />
                  <span className={styles.toggleLabel}>Supervisor</span>
                </label>
              </div>
              <p className={styles.accessNote}>Admin access: Always Enabled</p>
            </div>

            <div className={styles.actions}>
              <button type="submit" className={styles.saveBtn} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'periods' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Immersion Periods</h3>
              <p className={styles.sectionSubtitle}>Manage different immersion periods for different batches</p>
            </div>
            <button type="button" className={styles.addBtn} onClick={() => openPeriodModal()}>
              + Add Immersion Period
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
                      <span className={styles.periodStatusBadge} style={{ background: pStatusInfo.color }}>
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
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.periodArchiveBtn}
                        onClick={() => openArchiveModal(period)}
                        title="Snapshot this period and remove its live data. Snapshot is viewable in Archived Periods."
                      >
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
                  + Add First Period
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'general' && (
        <div className={styles.section}>
          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>General Settings</h3>
              <div className={styles.logoSection}>
                <label className={styles.logoLabel}>System Logo</label>
                <div className={styles.logoShell}>
                  {preview ? (
                    <img src={preview} alt="Logo preview" className={styles.logoPreview} />
                  ) : (
                    <div className={styles.logoSquare}>No logo</div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    disabled={logoUploading}
                  />
                  {logoUploading ? <span className={styles.note}>Uploading…</span> : null}
                </div>
              </div>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label htmlFor="system_name">System Name</label>
                  <input id="system_name" name="system_name" value={form.system_name || ''} onChange={handleChange} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="school_name">School Name</label>
                  <input id="school_name" name="school_name" value={form.school_name || ''} onChange={handleChange} />
                </div>
                <div className={styles.fieldFull}>
                  <label htmlFor="school_address">School Address</label>
                  <textarea id="school_address" name="school_address" rows={2} value={form.school_address || ''} onChange={handleChange} />
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <h3 className={styles.cardTitle}>System Announcements</h3>
              <div className={styles.fieldFull}>
                <label htmlFor="announcements">Announcements</label>
                <textarea
                  id="announcements"
                  name="announcements"
                  rows={3}
                  value={form.announcements || ''}
                  onChange={handleChange}
                  placeholder="Broadcast a system-wide announcement to users."
                />
              </div>
            </div>

            <div className={styles.actions}>
              <button type="submit" className={styles.saveBtn} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className={styles.section}>
          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Attendance Settings</h3>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label htmlFor="attendance_time_in">Time In (opens)</label>
                  <input id="attendance_time_in" name="attendance_time_in" type="time" value={form.attendance_time_in || ''} onChange={handleChange} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="attendance_time_out">Time Out (opens)</label>
                  <input id="attendance_time_out" name="attendance_time_out" type="time" value={form.attendance_time_out || ''} onChange={handleChange} />
                </div>
              </div>
            </div>
            <div className={styles.actions}>
              <button type="submit" className={styles.saveBtn} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {periodModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>{periodEditing ? 'Edit Immersion Period' : 'Add Immersion Period'}</h3>
              <button type="button" className={styles.modalClose} onClick={() => setPeriodModal(false)}>✕</button>
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
              <button type="button" className={styles.modalClose} onClick={closeArchiveModal} disabled={archiving}>✕</button>
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
