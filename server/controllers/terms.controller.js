const pool = require('../db');

// Records the one-time acceptance of the Work Immersion Monitoring System Terms
// and Agreement.
//
// Acceptance is a single, irreversible step per account, so this endpoint only
// ever moves the flag from false to true. Re-posting it is a no-op that still
// answers 200, which keeps a double click (or a retried request after a slow
// response) from looking like a failure to the client.
//
// The user id comes from the verified token, never from the request body, so a
// caller cannot record acceptance on somebody else's behalf.
const acceptTerms = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users
       SET terms_accepted = true,
           terms_accepted_at = COALESCE(terms_accepted_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, terms_accepted, terms_accepted_at`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      // verifyToken already rejects a missing account, so this only fires if the
      // row disappears between the auth check and this update.
      return res.status(404).json({ error: 'User not found.' });
    }

    const { terms_accepted, terms_accepted_at: acceptedAt } = result.rows[0];

    res.json({
      message: 'Terms and Agreement accepted.',
      terms_accepted: Boolean(terms_accepted),
      terms_accepted_at: acceptedAt || null,
    });
  } catch (err) {
    console.error('Accept terms error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { acceptTerms };