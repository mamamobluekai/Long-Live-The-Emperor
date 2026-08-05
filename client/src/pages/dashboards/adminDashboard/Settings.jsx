import { useEffect, useState } from 'react';
import {
  getAdminSettings,
  updateAdminSettings,
  uploadLogo,
} from '../../../api/adminApi';
import { useToast } from '../../../components/admin/ToastContainer';
import styles from './Settings.module.css';

export default function SettingsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [form, setForm] = useState({});
  const [preview, setPreview] = useState('');

  const load = async () => {
    setLoading(true);
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
      });
      setPreview(s.logo_url || '');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
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
      await saveSettings({ ...form, logo_url: url });
      showToast('Logo uploaded and saved.', 'success');
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

  if (loading) {
    return (
      <div className={styles.container}>
        <h2>System Settings</h2>
        <p>Loading settings…</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h2>System Settings</h2>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
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
          <div className={styles.field}>
            <label htmlFor="academic_year">Academic Year</label>
            <input id="academic_year" name="academic_year" value={form.academic_year || ''} onChange={handleChange} placeholder="e.g. 2025-2026" />
          </div>
          <div className={styles.field}>
            <label htmlFor="semester">Semester</label>
            <input id="semester" name="semester" value={form.semester || ''} onChange={handleChange} placeholder="e.g. First" />
          </div>
          <div className={styles.field}>
            <label htmlFor="attendance_time_in">Attendance Time In (opens)</label>
            <input id="attendance_time_in" name="attendance_time_in" type="time" value={form.attendance_time_in || ''} onChange={handleChange} />
          </div>
          <div className={styles.field}>
            <label htmlFor="attendance_time_out">Attendance Time Out (opens)</label>
            <input id="attendance_time_out" name="attendance_time_out" type="time" value={form.attendance_time_out || ''} onChange={handleChange} />
          </div>
        </div>

        <div className={styles.fieldFull}>
          <label htmlFor="announcements">System Announcements</label>
          <textarea
            id="announcements"
            name="announcements"
            rows={3}
            value={form.announcements || ''}
            onChange={handleChange}
            placeholder="Broadcast a system-wide announcement to users."
          />
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.saveBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
