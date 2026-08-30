const express = require('express');
const router = express.Router();
const { getDashboardStats, getDashboardAnalytics } = require('../controllers/dashboardController');
const { protect, authorize } = require('../middleware/auth');

router.get('/stats', protect, authorize('agent', 'admin'), getDashboardStats);
router.get('/analytics', protect, authorize('agent', 'admin'), getDashboardAnalytics);

module.exports = router;
