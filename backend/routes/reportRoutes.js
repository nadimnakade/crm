const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { exportInteractions, exportOrders, exportFollowups, getTopAgents, getActiveUsers, getWeeklyOrderStats, getCallOutcomeStats } = require('../controllers/reportController');

// Admin-only export for customer-wise interaction logs (include Orders Viewer)
router.get('/interactions/export', protect, authorize('Admin', 'Super Admin', 'admin', 'Orders Viewer', 'orders viewer'), exportInteractions);
// Admin-only export for order-only details (include Orders Viewer)
router.get('/orders/export', protect, authorize('Admin', 'Super Admin', 'admin', 'Orders Viewer', 'orders viewer'), exportOrders);
// Admin-only export for followup orders (include Orders Viewer)
router.get('/followups/export', protect, authorize('Admin', 'Super Admin', 'admin', 'Orders Viewer', 'orders viewer'), exportFollowups);

// Dashboard Reports
// Top 10 Daily Agents (by Orders)
router.get('/top-agents', protect, authorize('Admin', 'Super Admin', 'admin'), getTopAgents);
// Active User Report
router.get('/active-users', protect, authorize('Admin', 'Super Admin', 'admin'), getActiveUsers);

// Chart Data Reports
router.get('/weekly-orders', protect, getWeeklyOrderStats);
router.get('/call-outcomes', protect, getCallOutcomeStats);

module.exports = router;
