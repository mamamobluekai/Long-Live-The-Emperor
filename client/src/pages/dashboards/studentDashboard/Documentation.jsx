import { useEffect, useState } from 'react';
import { uploadMyFile, getMyFiles, deleteMyFile } from '../../../api/fileApi';
import styles from './Documentation.module.css';

function Documentation({ user }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError('');
      try {
        const result = await getMyFiles();
        if (!cancelled) setFiles(Array.isArray(result) ? result : []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load files.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const result = await uploadMyFile(selectedFile);
      setFiles((prev) => [result, ...prev]);
      setMessage(`${selectedFile.name} uploaded successfully.`);
      setSelectedFile(null);
      e.target.reset();
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId) => {
    if (!window.confirm('Remove this uploaded document?')) return;
    setDeleting(fileId);
    setError('');
    setMessage('');
    try {
      await deleteMyFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      setMessage('Document removed.');
    } catch (err) {
      setError(err.message || 'Delete failed.');
    } finally {
      setDeleting(null);
    }
  };

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

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Documentation</h2>
        <p>Upload and manage your documents.</p>
      </div>

      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Upload Document</h3>
        <form onSubmit={handleUpload} className={styles.uploadForm}>
          <div className={styles.uploadRow}>
            <input
              type="file"
              onChange={(e) => setSelectedFile(e.target.files[0] || null)}
              disabled={uploading}
              className={styles.fileInput}
            />
            <button type="submit" className={styles.uploadBtn} disabled={uploading || !selectedFile}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          {selectedFile && (
            <div className={styles.fileMeta}>Selected: {selectedFile.name} ({formatSize(selectedFile.size)})</div>
          )}
        </form>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Uploaded Files ({files.length})</h3>
        {loading ? (
          <p className={styles.loading}>Loading...</p>
        ) : files.length === 0 ? (
          <p className={styles.empty}>No documents uploaded yet.</p>
        ) : (
          <ul className={styles.docList}>
            {files.map((file) => (
              <li key={file.id} className={styles.docItem}>
                <div className={styles.docInfo}>
                  <div className={styles.docName}>
                    <span className={styles.fileIcon}>{getFileIcon(file.mime_type)}</span>
                    {file.original_name}
                  </div>
                  <div className={styles.docMeta}>
                    {file.mime_type} &middot; {formatSize(file.file_size)} &middot; {new Date(file.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className={styles.docActions}>
                  {file.cloudinary_url && (
                    <a
                      href={file.cloudinary_url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.btnGhost}
                    >
                      View
                    </a>
                  )}
                  {file.cloudinary_url && (
                    <a
                      href={file.cloudinary_url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.btnDownload}
                    >
                      Download
                    </a>
                  )}
                  <button
                    className={styles.btnDanger}
                    disabled={deleting === file.id}
                    onClick={() => handleDelete(file.id)}
                  >
                    {deleting === file.id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Documentation;
