const pool = require('../../db');

function isSupportedPushEndpoint(value) {
  try {
    const { hostname, protocol } = new URL(value);
    return protocol === 'https:'
      && (
        hostname === 'fcm.googleapis.com'
        || hostname.endsWith('.push.services.mozilla.com')
        || hostname === 'web.push.apple.com'
      );
  } catch {
    return false;
  }
}

function getVapidPublicKey(req, res) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(503).json({ error: 'Attendance reminders are not configured yet.' });
  }
  return res.json({ publicKey });
}

async function saveSubscription(req, res) {
  const subscription = req.body?.subscription;
  const endpoint = subscription?.endpoint;
  const keys = subscription?.keys;

  if (
    typeof endpoint !== 'string'
    || !isSupportedPushEndpoint(endpoint)
    || typeof keys?.p256dh !== 'string'
    || typeof keys?.auth !== 'string'
  ) {
    return res.status(400).json({ error: 'A valid push subscription is required.' });
  }

  try {
    await pool.query(
      `INSERT INTO attendance_push_subscriptions (user_id, endpoint, subscription, updated_at)
       VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           subscription = EXCLUDED.subscription,
           updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, endpoint, JSON.stringify(subscription)],
    );
    return res.status(204).end();
  } catch (err) {
    console.error('Save attendance push subscription error:', err);
    return res.status(500).json({ error: 'Could not enable attendance reminders.' });
  }
}

async function deleteSubscription(req, res) {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string' || !isSupportedPushEndpoint(endpoint)) {
    return res.status(400).json({ error: 'A valid push subscription endpoint is required.' });
  }

  try {
    await pool.query(
      'DELETE FROM attendance_push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [req.user.id, endpoint],
    );
    return res.status(204).end();
  } catch (err) {
    console.error('Delete attendance push subscription error:', err);
    return res.status(500).json({ error: 'Could not disable attendance reminders.' });
  }
}

module.exports = { getVapidPublicKey, saveSubscription, deleteSubscription };
