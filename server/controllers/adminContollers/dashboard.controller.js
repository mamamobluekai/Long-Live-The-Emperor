const { getDashboardStats, getPeriodAnalytics } = require('../../services/admin.service');

const dashboard = async (req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json({ stats });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const periodAnalytics = async (req, res) => {
  try {
    const analytics = await getPeriodAnalytics();
    res.json(analytics);
  } catch (err) {
    console.error('Admin period analytics error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { dashboard, periodAnalytics };
