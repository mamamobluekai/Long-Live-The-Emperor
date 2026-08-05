const { getDashboardStats } = require('../../services/admin.service');

const dashboard = async (req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json({ stats });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { dashboard };
