// Grading for daily work-immersion documentation.
//
// The teacher rates EVERY criterion with 1-5 stars, and the grade is derived
// automatically from those ratings, weighted by each criterion's points:
//
//   criterion score = (stars / 5) * 100
//   total = Σ(criterion score × points) / Σ(points)
//
// The 100-point total is then mapped to the DepEd-style 4-point rubric that is
// what teachers actually record:
//
//   90-100 = 4 Excellent | 80-89 = 3 Very Satisfactory
//   70-79  = 2 Satisfactory | below 70 = 1 Needs Improvement

const RATING_BANDS = [
  { min: 90, stars: 4, label: 'Excellent' },
  { min: 80, stars: 3, label: 'Very Satisfactory' },
  { min: 70, stars: 2, label: 'Satisfactory' },
  { min: 0, stars: 1, label: 'Needs Improvement' },
];

const MAX_STARS = 5;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Map a 100-point total onto the 4-point rubric. */
function ratingForScore(score) {
  const value = clamp(Math.round(Number(score) || 0), 0, 100);
  const band = RATING_BANDS.find((entry) => value >= entry.min) || RATING_BANDS[RATING_BANDS.length - 1];
  return { ...band, score: value };
}

/**
 * Validate a teacher's per-criterion star ratings.
 * @param {object[]} ratings [{ id, stars }]
 * @returns {string|null} error message, or null when valid
 */
function validateRatings(ratings, criteria = []) {
  if (!Array.isArray(ratings) || ratings.length === 0) {
    return 'Rate every criterion before submitting.';
  }
  for (const entry of ratings) {
    const stars = Number(entry.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > MAX_STARS) {
      return 'Each criterion needs a rating from 1 to 5 stars.';
    }
  }
  if (criteria.length && ratings.length !== criteria.length) {
    return `Rate all ${criteria.length} criteria before submitting.`;
  }
  return null;
}

/**
 * Compute the grade from the teacher's star ratings, weighted by the points of
 * each criterion in `documentation_criteria`.
 *
 * @param {object[]} criteria rows with { id, criterion_name, points }
 * @param {object[]} ratings  rows with { id, stars }
 */
function computeGradeFromRatings(criteria = [], ratings = []) {
  const ratingById = new Map(ratings.map((r) => [Number(r.id), Number(r.stars)]));

  const totalPoints = criteria.reduce((sum, c) => sum + (Number(c.points) || 0), 0);
  if (totalPoints <= 0) {
    return { total: 0, stars: 1, label: 'Needs Improvement', breakdown: [] };
  }

  let weighted = 0;
  const breakdown = criteria.map((c) => {
    const points = Number(c.points) || 0;
    const stars = ratingById.get(Number(c.id)) || 0;
    const score = (stars / MAX_STARS) * 100;
    weighted += score * points;
    return {
      id: c.id,
      criterion_name: c.criterion_name,
      points,
      stars,
      score: Math.round(score),
      weighted: Number(((score / 100) * points).toFixed(2)),
    };
  });

  const total = Math.round(weighted / totalPoints);
  const rating = ratingForScore(total);

  return {
    total,
    stars: rating.stars,
    label: rating.label,
    maxStars: MAX_STARS,
    breakdown,
  };
}

module.exports = {
  computeGradeFromRatings,
  ratingForScore,
  validateRatings,
  RATING_BANDS,
  MAX_STARS,
};
