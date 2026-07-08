import { useEffect, useState } from 'react';
import { getAllFiles, getFileById } from '../../../api/fileApi';
import styles from './TeacherDocuments.module.css';

function TeacherDocuments() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setError('');
      try {
        const result = await getAllFiles();
        if (!cancelled) setFiles(result);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const handlePreview = async (fileId) => {
    setError('');
    try {
      const result = await getFileById(fileId);
      setPreview(result);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleClosePreview = () => setPreview(null);

  const formatSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const getFileIcon = (mimeType) => {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📕';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📘';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📗';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📙';
    return '📄';
  };

  const isPreviewable = (mimeType) => {
    if (!mimeType) return false;
    return mimeType.startsWith('image/') || mimeType === 'application/pdf';
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Student Documents</h2>
        <p>View and download documents uploaded by students.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        {loading ? (
          <p className={styles.loading}>Loading documents...</p>
        ) : files.length === 0 ? (
          <p className={styles.empty}>No documents uploaded yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Student</th>
                <th>File</th>
                <th>Type</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id}>
                  <td>
                    <div className={styles.studentName}>{file.student_name}</div>
                    <div className={styles.studentEmail}>{file.student_email}</div>
                  </td>
                  <td>
                    <div className={styles.fileNameCell}>
                      <span className={styles.fileIcon}>{getFileIcon(file.mime_type)}</span>
                      {file.original_name}
                    </div>
                  </td>
                  <td>{file.mime_type}</td>
                  <td>{formatSize(file.file_size)}</td>
                  <td>{new Date(file.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className={styles.actions}>
                      {isPreviewable(file.mime_type) && file.cloudinary_url && (
                        <button className={styles.btnPreview} onClick={() => handlePreview(file.id)}>
                          Preview
                        </button>
                      )}
                      {file.cloudinary_url && (
                        <a
                          href={file.cloudinary_url}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.btnDownload}
                          title="Download file"
                        >
                          Download
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {preview && (
        <div className={styles.modal} onClick={handleClosePreview}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Document Preview</h3>
              <button className={styles.closeBtn} onClick={handleClosePreview}>×</button>
            </div>
            <div className={styles.modalBody}>
              <p><strong>Student:</strong> {preview.student_name} ({preview.student_email})</p>
              <p><strong>File:</strong> {preview.original_name}</p>
              <p><strong>Type:</strong> {preview.mime_type}</p>
              <p><strong>Size:</strong> {formatSize(preview.file_size)}</p>
              <p><strong>Uploaded:</strong> {new Date(preview.created_at).toLocaleString()}</p>
              <div className={styles.previewActions}>
                {preview.cloudinary_url && isPreviewable(preview.mime_type) && preview.mime_type.startsWith('image/') && (
                  <img src={preview.cloudinary_url} alt={preview.original_name} className={styles.previewImage} />
                )}
                {preview.cloudinary_url && preview.mime_type === 'application/pdf' && (
                  <iframe src={preview.cloudinary_url} className={styles.previewIframe} title="PDF preview" />
                )}
                <a
                  href={preview.cloudinary_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.btnDownload}
                >
                  {isPreviewable(preview.mime_type) ? 'Open / Download' : 'Download'}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeacherDocuments;
