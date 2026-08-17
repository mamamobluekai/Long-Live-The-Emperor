import { useRef, useState } from 'react';
import { useToast } from '../../components/admin/ToastContainer';
import { createFeedPost } from '../../api/feedApi';
import styles from './PostComposer.module.css';

const POST_TYPES = [
  { value: 'announcement', label: 'Announcement',  color: '#2a5298' },
  { value: 'advertisement', label: 'Advertisement', color: '#f59e0b' },
  { value: 'endorsement', label: 'Endorsement', color: '#10b981' },
  { value: 'survey', label: 'Survey', color: '#8b5cf6' },
];

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'All Students' },
  { value: 'grade_12', label: 'Grade 12' },
];

export default function PostComposer({ user, onPostCreated }) {
  const { showToast } = useToast();
  const [postType, setPostType] = useState('announcement');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPreview, setLinkPreview] = useState(null);
  const [audience, setAudience] = useState('all');
  const [surveyOptions, setSurveyOptions] = useState(['', '']);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be smaller than 5 MB.', 'error');
      return;
    }
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLinkChange = (e) => {
    const url = e.target.value.trim();
    setLinkUrl(url);
    if (url) {
      try {
        const u = new URL(url);
        setLinkPreview({
          url,
          domain: u.hostname,
          title: u.hostname,
          description: '',
        });
      } catch {
        setLinkPreview(null);
      }
    } else {
      setLinkPreview(null);
    }
  };

  const addSurveyOption = () => {
    setSurveyOptions((prev) => [...prev, '']);
  };

  const removeSurveyOption = (index) => {
    setSurveyOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSurveyOption = (index, value) => {
    setSurveyOptions((prev) => prev.map((opt, i) => (i === index ? value : opt)));
  };

  const canSubmit = content.trim().length > 0 && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const postData = {
        postType,
        content: content.trim(),
        title: title.trim() || null,
        image,
        linkUrl: linkUrl.trim() || null,
        linkTitle: linkPreview?.title || null,
        linkDescription: linkPreview?.description || null,
        linkDomain: linkPreview?.domain || null,
        audience,
        surveyOptions: postType === 'survey' ? surveyOptions.filter((o) => o.trim()) : undefined,
      };

      const data = await createFeedPost(postData);
      showToast('Post published successfully!', 'success');
      setContent('');
      setTitle('');
      setImage(null);
      setImagePreview(null);
      setLinkUrl('');
      setLinkPreview(null);
      setSurveyOptions(['', '']);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onPostCreated?.(data.post);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.composer}>
      <div className={styles.composerHeader}>
        <img
          src={user?.photo_url || ''}
          alt=""
          className={styles.avatar}
        />
        <div className={styles.composerMeta}>
          <strong className={styles.authorName}>
            {user?.first_name || user?.last_name
              ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
              : user?.email}
          </strong>
          <span className={styles.roleBadge}>{user?.role || 'Staff'}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className={styles.typeTabs}>
          {POST_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              className={`${styles.typeTab} ${postType === type.value ? styles.typeTabActive : ''}`}
              style={postType === type.value ? { borderColor: type.color, color: type.color, backgroundColor: `${type.color}12` } : {}}
              onClick={() => setPostType(type.value)}
            >
              <span className={styles.typeIcon}>{type.icon}</span>
              {type.label}
            </button>
          ))}
        </div>

        <div className={styles.inputGroup}>
          {(postType === 'announcement' || postType === 'advertisement' || postType === 'endorsement') && (
            <input
              type="text"
              placeholder="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={styles.titleInput}
            />
          )}
          <textarea
            placeholder="What's on your mind?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={styles.contentInput}
            rows={3}
          />
        </div>

        {imagePreview && (
          <div className={styles.imagePreview}>
            <img src={imagePreview} alt="Preview" className={styles.previewImg} />
            <button type="button" className={styles.removeImageBtn} onClick={removeImage}>✕</button>
          </div>
        )}

        {postType === 'survey' && (
          <div className={styles.surveyBuilder}>
            <label className={styles.surveyLabel}>Survey Question</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter your question..."
              className={styles.surveyInput}
            />
            <label className={styles.surveyLabel}>Options</label>
            {surveyOptions.map((opt, idx) => (
              <div key={idx} className={styles.surveyOptionRow}>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => updateSurveyOption(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  className={styles.surveyInput}
                />
                {surveyOptions.length > 2 && (
                  <button type="button" className={styles.removeOptionBtn} onClick={() => removeSurveyOption(idx)}>✕</button>
                )}
              </div>
            ))}
            <button type="button" className={styles.addOptionBtn} onClick={addSurveyOption}>+ Add Option</button>
          </div>
        )}

        <div className={styles.attachmentRow}>
          <div className={styles.attachGroup}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className={styles.hiddenInput}
              id="feed-image"
            />
            <label htmlFor="feed-image" className={styles.attachBtn}>
              📷 Photo
            </label>
            <input
              type="text"
              placeholder="Paste a link (optional)"
              value={linkUrl}
              onChange={handleLinkChange}
              className={styles.linkInput}
            />
          </div>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className={styles.audienceSelect}
          >
            {AUDIENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button type="submit" className={styles.postBtn} disabled={!canSubmit}>
            {submitting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}
