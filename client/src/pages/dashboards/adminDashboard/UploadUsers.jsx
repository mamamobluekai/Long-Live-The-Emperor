import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, ArrowRight } from 'lucide-react';
import styles from './UploadUsers.module.css';

export default function UploadUsers() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(null);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Upload Users</h1>
          <p>
            Add new user accounts to the system. Choose to add users one at a
            time manually, or import many accounts at once from an Excel file.
          </p>
        </div>
      </div>

      <div className={styles.actionGrid}>
        <button
          type="button"
          className={`${styles.actionCard} ${hovered === 'manual' ? styles.actionCardHovered : ''}`}
          onMouseEnter={() => setHovered('manual')}
          onMouseLeave={() => setHovered(null)}
          onClick={() => navigate('/dashboard/admin/manual-users')}
          aria-label="Add user manually"
        >
          <div className={styles.actionIcon}>
            <Plus size={20} aria-hidden="true" />
          </div>
          <div>
            <h3>Add User Manually</h3>
            <p>
              Create a teacher, supervisor, or coordinator account one at a time
              by entering their details.
            </p>
          </div>
          <span className={styles.actionArrow}>
            <ArrowRight size={16} aria-hidden="true" />
          </span>
        </button>

        <button
          type="button"
          className={`${styles.actionCard} ${hovered === 'bulk' ? styles.actionCardHovered : ''}`}
          onMouseEnter={() => setHovered('bulk')}
          onMouseLeave={() => setHovered(null)}
          onClick={() => navigate('/dashboard/admin/upload-bulk')}
          aria-label="Upload users from Excel"
        >
          <div className={styles.actionIcon}>
            <Upload size={20} aria-hidden="true" />
          </div>
          <div>
            <h3>Upload Users from Excel</h3>
            <p>
              Import teachers, supervisors, and coordinators in bulk from an
              Excel workbook.
            </p>
          </div>
          <span className={styles.actionArrow}>
            <ArrowRight size={16} aria-hidden="true" />
          </span>
        </button>
      </div>
    </div>
  );
}
