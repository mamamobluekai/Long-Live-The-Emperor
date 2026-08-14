import { useEffect, useState } from 'react';
import {
  getEvaluationCriteria,
  saveEvaluationCriteria,
} from '../../../api/evaluationApi';
import styles from './SupervisorEvaluation.module.css';

function SupervisorEvaluation() {
  const [criteria, setCriteria] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  // -----------------------------
  // Load data
  // -----------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setError('');
      setMessage('');

      try {
        const criteriaData = await getEvaluationCriteria();

        if (cancelled) return;

        setCriteria(criteriaData.criteria || []);
      } catch (e) {
        if (!cancelled) {
          setError(e.message);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  // -----------------------------
  // Criteria helpers
  // -----------------------------
  function updateCategory(categoryIndex, changes) {
    setCriteria((current) =>
      current.map((category, index) =>
        index === categoryIndex
          ? { ...category, ...changes }
          : category
      )
    );
  }

  function updateIndicator(categoryIndex, indicatorIndex, value) {
    setCriteria((current) =>
      current.map((category, index) => {
        if (index !== categoryIndex) return category;

        const indicators = [...category.indicators];
        indicators[indicatorIndex] = value;

        return {
          ...category,
          indicators,
        };
      })
    );
  }

  function addIndicator(categoryIndex) {
    setCriteria((current) =>
      current.map((category, index) =>
        index === categoryIndex
          ? {
              ...category,
              indicators: [...category.indicators, 'New indicator'],
            }
          : category
      )
    );
  }

  function removeIndicator(categoryIndex, indicatorIndex) {
    setCriteria((current) =>
      current.map((category, index) =>
        index === categoryIndex
          ? {
              ...category,
              indicators: category.indicators.filter(
                (_, i) => i !== indicatorIndex
              ),
            }
          : category
      )
    );
  }

  function addCategory() {
    setCriteria((current) => [
      ...current,
      {
        id: Date.now(),
        category_name: 'New Category',
        indicators: ['Indicator 1'],
        sort_order: current.length + 1,
      },
    ]);
  }

  function removeCategory(categoryIndex) {
    setCriteria((current) =>
      current
        .filter((_, index) => index !== categoryIndex)
        .map((category, index) => ({
          ...category,
          sort_order: index + 1,
        }))
    );
  }

  // -----------------------------
  // Save criteria
  // -----------------------------
  async function handleSaveCriteria(event) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await saveEvaluationCriteria(criteria);
      setMessage('Evaluation criteria updated successfully.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------
  // Save criteria
  // -----------------------------
  return (
    <div>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <h2>Student Criteria</h2>
        <p>Manage evaluation criteria and view evaluation records.</p>
      </div>

      {/* Messages */}
      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {/* Evaluation Criteria */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Evaluation Criteria</h3>

        <p className={styles.muted} style={{ marginBottom: 12 }}>
          Edit categories and indicators as needed. These will be used for all
          evaluations.
        </p>

        <form onSubmit={handleSaveCriteria}>
          {criteria.map((category, categoryIndex) => (
            <div
              key={category.id}
              className={styles.categoryCard}
            >
              {/* Category Header */}
              <div className={styles.categoryHeader}>
                <label
                  className={styles.filterField}
                  style={{ flex: 1 }}
                >
                  Category Name

                  <input
                    className={styles.input}
                    value={category.category_name}
                    onChange={(event) =>
                      updateCategory(categoryIndex, {
                        category_name: event.target.value,
                      })
                    }
                  />
                </label>

                <label
                  className={styles.filterField}
                  style={{ width: 80 }}
                >
                  Order

                  <input
                    className={styles.input}
                    type="number"
                    value={category.sort_order}
                    onChange={(event) =>
                      updateCategory(categoryIndex, {
                        sort_order: Number(event.target.value),
                      })
                    }
                  />
                </label>

                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => removeCategory(categoryIndex)}
                >
                  Remove
                </button>
              </div>

              {/* Indicators */}
              {category.indicators.map((indicator, indicatorIndex) => (
                <div
                  key={indicatorIndex}
                  className={styles.indicatorRow}
                >
                  <input
                    className={styles.input}
                    value={indicator}
                    onChange={(event) =>
                      updateIndicator(
                        categoryIndex,
                        indicatorIndex,
                        event.target.value
                      )
                    }
                  />

                  <button
                    type="button"
                    className={styles.btnDangerSm}
                    onClick={() =>
                      removeIndicator(
                        categoryIndex,
                        indicatorIndex
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}

              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => addIndicator(categoryIndex)}
                style={{ marginTop: 6 }}
              >
                Add Indicator
              </button>
            </div>
          ))}

          {/* Criteria Actions */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={addCategory}
            >
              Add Category
            </button>

            <button
              type="submit"
              className={styles.btn}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Criteria'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default SupervisorEvaluation;