import { useEffect, useState } from 'react';
import { getSurveyOptions, respondToSurvey, getSurveyResults } from '../../api/feedApi';
import { useToast } from '../../components/admin/ToastContainer';
import styles from './SurveyBlock.module.css';

export default function SurveyBlock({ postId, currentUser, authorId }) {
  const { showToast } = useToast();
  const [options, setOptions] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [hasResponded, setHasResponded] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const isAuthor = currentUser?.id === authorId;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const optRes = await getSurveyOptions(postId);
        if (!mounted) return;
        setOptions(optRes.options || []);
      } catch (err) {
        if (mounted) showToast(err.message, 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const handleVote = async () => {
    if (!selectedOption && selectedOption !== 0) return;
    setSubmitting(true);
    try {
      await respondToSurvey(postId, selectedOption);
      setHasResponded(true);
      const resRes = await getSurveyResults(postId);
      setResults(resRes.results || []);
      showToast('Response recorded. Thank you!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const totalVotes = results?.reduce((sum, r) => sum + Number(r.count), 0) || 0;

  if (loading) {
    return <div className={styles.surveyCard}>Loading survey...</div>;
  }

  if (options.length === 0) {
    return <div className={styles.surveyCard}>No options available for this survey.</div>;
  }

  return (
    <div className={styles.surveyCard}>
      <div className={styles.surveyHeader}>
        <span className={styles.surveyIcon}>📊</span>
        <span className={styles.surveyLabel}>Survey</span>
      </div>

      {!hasResponded && !isAuthor && (
        <div className={styles.surveyVote}>
          {options.map((opt) => (
            <label key={opt.id} className={`${styles.optionCard} ${selectedOption === opt.id ? styles.optionCardSelected : ''}`}>
              <input
                type="radio"
                name={`survey-${postId}`}
                value={opt.id}
                checked={selectedOption === opt.id}
                onChange={() => setSelectedOption(opt.id)}
                className={styles.radioInput}
              />
              <span className={styles.optionText}>{opt.option_text}</span>
            </label>
          ))}
          <button
            type="button"
            className={styles.voteBtn}
            onClick={handleVote}
            disabled={selectedOption === null || submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Response'}
          </button>
        </div>
      )}

      {hasResponded && !isAuthor && (
        <div className={styles.surveyResults}>
          <p className={styles.resultsTitle}>Thank you for responding! Here are the results:</p>
          {options.map((opt) => {
            const count = results?.find((r) => String(r.option_id) === String(opt.id))?.count || 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            return (
              <div key={opt.id} className={styles.resultRow}>
                <div className={styles.resultLabel}>{opt.option_text}</div>
                <div className={styles.resultBar}>
                  <div className={styles.resultFill} style={{ width: `${pct}%` }} />
                </div>
                <div className={styles.resultCount}>{count} ({pct}%)</div>
              </div>
            );
          })}
          <div className={styles.totalVotes}>{totalVotes} total responses</div>
        </div>
      )}

      {isAuthor && (
        <div className={styles.surveyResults}>
          <p className={styles.resultsTitle}>Survey Results (Author View)</p>
          {options.map((opt) => {
            const count = results?.find((r) => String(r.option_id) === String(opt.id))?.count || 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            return (
              <div key={opt.id} className={styles.resultRow}>
                <div className={styles.resultLabel}>{opt.option_text}</div>
                <div className={styles.resultBar}>
                  <div className={styles.resultFill} style={{ width: `${pct}%` }} />
                </div>
                <div className={styles.resultCount}>{count} ({pct}%)</div>
              </div>
            );
          })}
          <div className={styles.totalVotes}>{totalVotes} total responses</div>
        </div>
      )}
    </div>
  );
}
