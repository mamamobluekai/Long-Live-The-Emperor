import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  School,
  BriefcaseBusiness,
  ShieldCheck,
  Plus,
  AlertCircle,
} from 'lucide-react';
import { createUser } from '../../../api/adminApi';
import { useToast } from '../../../components/admin/toastContext';
import styles from './ManualUser.module.css';

const ROLES = [
  {
    key: 'teacher',
    label: 'Teacher',
    icon: School,
    description:
      'Add teaching staff manually. Each account is created with the department and designation you provide.',
    fields: [
      { key: 'firstName', label: 'First Name', type: 'text', required: true },
      { key: 'lastName', label: 'Last Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'employeeId', label: 'Employee ID', type: 'text', required: true },
      { key: 'department', label: 'Department', type: 'text', required: true },
      { key: 'position', label: 'Position', type: 'text', required: true },
      { key: 'phone', label: 'Phone Number', type: 'tel', required: false },
    ],
  },
  {
    key: 'supervisor',
    label: 'Supervisor',
    icon: BriefcaseBusiness,
    description:
      'Add partner company supervisors manually, including the host company they represent.',
    fields: [
      { key: 'firstName', label: 'First Name', type: 'text', required: true },
      { key: 'lastName', label: 'Last Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'employeeId', label: 'Employee ID', type: 'text', required: true },
      { key: 'companyName', label: 'Company Name', type: 'text', required: true },
      { key: 'position', label: 'Position', type: 'text', required: true },
      { key: 'department', label: 'Department', type: 'text', required: false },
      { key: 'phone', label: 'Phone Number', type: 'tel', required: false },
    ],
  },
  {
    key: 'coordinator',
    label: 'Coordinator',
    icon: ShieldCheck,
    description:
      'Add work immersion coordinators manually. New accounts stay pending until you approve them.',
    fields: [
      { key: 'firstName', label: 'First Name', type: 'text', required: true },
      { key: 'lastName', label: 'Last Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'employeeId', label: 'Coordinator ID', type: 'text', required: true },
      { key: 'department', label: 'Department', type: 'text', required: true },
      { key: 'position', label: 'Position', type: 'text', required: true },
      { key: 'phone', label: 'Phone Number', type: 'tel', required: false },
    ],
  },
];

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  employeeId: '',
  companyName: '',
  department: '',
  position: '',
  phone: '',
};

export default function ManualUser() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState('teacher');
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const roleConfig = ROLES.find((r) => r.key === selectedRole);

  const handleRoleChange = (key) => {
    setSelectedRole(key);
    setFormData({ ...EMPTY_FORM });
    setError('');
  };

  const handleInputChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        role: selectedRole,
        employeeId: formData.employeeId ? formData.employeeId.trim() : undefined,
        companyName: formData.companyName ? formData.companyName.trim() : undefined,
        department: formData.department ? formData.department.trim() : undefined,
        position: formData.position ? formData.position.trim() : undefined,
        phone: formData.phone ? formData.phone.trim() : undefined,
      };

      await createUser(payload);
      showToast(`${roleConfig.label} account created. It is pending approval.`, 'success');
      navigate('/dashboard/admin/users');
    } catch (err) {
      setError(err.message || 'Failed to create account. Please try again.');
      showToast(err.message || 'Failed to create account.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    const requiredFields = roleConfig.fields.filter((f) => f.required);
    return requiredFields.every((f) => formData[f.key] && formData[f.key].trim() !== '');
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>Create User Account</p>
          <h1>Manually Add User</h1>
          <p>
            Create a teacher, supervisor, or coordinator account one at a time.
            Accounts are created as pending and stay inactive until approved.
          </p>
        </div>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => navigate('/dashboard/admin/upload-users')}
          aria-label="Back to Upload Users"
        >
          <ArrowLeft size={16} strokeWidth={1.9} aria-hidden="true" />
          Back
        </button>
      </div>

      <section className={styles.roleSelectorCard}>
        <div className={styles.roleSelectorHeader}>
          <h2>Choose Role</h2>
          <p>Select the type of account you want to create manually.</p>
        </div>
        <div className={styles.roleGrid}>
          {ROLES.map((role) => {
            const RoleIcon = role.icon;
            const isActive = selectedRole === role.key;
            return (
              <button
                key={role.key}
                type="button"
                className={`${styles.roleButton} ${isActive ? styles.roleButtonActive : ''}`}
                onClick={() => handleRoleChange(role.key)}
                aria-pressed={isActive}
              >
                <span className={styles.roleIcon}>
                  <RoleIcon size={18} aria-hidden="true" />
                </span>
                <span className={styles.roleName}>{role.label}</span>
                <span className={styles.roleDesc}>{role.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.createFormCard}>
        <div className={styles.createFormHeader}>
          <h2>Create {roleConfig.label} Account</h2>
        </div>

        {error && (
          <div className={styles.errorAlert}>
            <AlertCircle size={16} aria-hidden="true" />
            {error}
          </div>
        )}

        <form className={styles.createFormBody} onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            {roleConfig.fields.map((field) => (
              <div
                key={field.key}
                className={`${styles.field} ${field.required ? styles.fieldFull : ''}`}
              >
                <label htmlFor={field.key}>
                  {field.label}{field.required ? ' *' : ''}
                </label>
                <input
                  id={field.key}
                  name={field.key}
                  type={field.type}
                  value={formData[field.key] || ''}
                  onChange={(e) => handleInputChange(field.key, e.target.value)}
                  required={field.required}
                  autoComplete="off"
                />
                {field.key === 'password' && (
                  <p className={styles.fieldHint}>
                    Must be at least 8 characters.
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => {
                setFormData({ ...EMPTY_FORM });
                setError('');
              }}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.createBtn}
              disabled={loading || !isFormValid()}
            >
              <Plus size={16} aria-hidden="true" />
              {loading ? 'Creating...' : `Create ${roleConfig.label} Account`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
