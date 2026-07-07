import { useState } from 'react';
import { uploadTeachersExcel, uploadSupervisorsExcel, uploadCoordinatorsExcel } from '../../../api/adminApi';
import styles from './UploadUsers.module.css';

function UploadUsers() {
  const [teachersFile, setTeachersFile] = useState(null);
  const [supervisorsFile, setSupervisorsFile] = useState(null);
  const [coordinatorsFile, setCoordinatorsFile] = useState(null);
  const [loading, setLoading] = useState({ teachers: false, supervisors: false, coordinators: false });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleUpload = async (type) => {
    const file = { teachers: teachersFile, supervisors: supervisorsFile, coordinators: coordinatorsFile }[type];
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setLoading(prev => ({ ...prev, [type]: true }));
    setError('');
    setMessage('');

    const uploadFn = { teachers: uploadTeachersExcel, supervisors: uploadSupervisorsExcel, coordinators: uploadCoordinatorsExcel }[type];

    try {
      const data = await uploadFn(file);
      setMessage(data.message || `${type.charAt(0).toUpperCase() + type.slice(1)} uploaded successfully.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  return (
    <div className={styles.container}>
      <h2>Upload Users via Excel</h2>
      
      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.uploadSection}>
        <h3>Teachers</h3>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setTeachersFile(e.target.files[0])} />
        <button onClick={() => handleUpload('teachers')} disabled={loading.teachers}>
          {loading.teachers ? 'Uploading...' : 'Upload Teachers'}
        </button>
      </div>

      <div className={styles.uploadSection}>
        <h3>Supervisors</h3>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setSupervisorsFile(e.target.files[0])} />
        <button onClick={() => handleUpload('supervisors')} disabled={loading.supervisors}>
          {loading.supervisors ? 'Uploading...' : 'Upload Supervisors'}
        </button>
      </div>

      <div className={styles.uploadSection}>
        <h3>Coordinators</h3>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setCoordinatorsFile(e.target.files[0])} />
        <button onClick={() => handleUpload('coordinators')} disabled={loading.coordinators}>
          {loading.coordinators ? 'Uploading...' : 'Upload Coordinators'}
        </button>
      </div>
    </div>
  );
}

export default UploadUsers;