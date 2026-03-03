const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { exportInteractions, exportOrders, exportFollowups, exportFollowupStatusUpdates, exportReorderStatusUpdates, exportOrderStatusUpdates, listFollowupStatusUpdates, listReorderStatusUpdates, listOrderStatusUpdates, getFollowupCountsHierarchy, getTopAgents, getActiveUsers, getWeeklyOrderStats, getCallOutcomeStats } = require('../controllers/reportController');

// Admin-only export for customer-wise interaction logs (include Orders Viewer)
router.get('/interactions/export', protect, authorize('Admin', 'Super Admin', 'admin', 'Orders Viewer', 'orders viewer'), exportInteractions);
// Admin-only export for order-only details (include Orders Viewer)
router.get('/orders/export', protect, authorize('Admin', 'Super Admin', 'admin', 'Orders Viewer', 'orders viewer'), exportOrders);
// Admin-only export for followup orders (include Orders Viewer)
router.get('/followups/export', protect, authorize('Admin', 'Super Admin', 'admin', 'Orders Viewer', 'orders viewer'), exportFollowups);
// Hierarchy-wise export for follow-up status updates by agent (admin, manager, orders viewer)
router.get('/followup-updates/export', protect, authorize('Admin', 'Super Admin', 'admin', 'Manager', 'manager', 'Orders Viewer', 'orders viewer'), exportFollowupStatusUpdates);
// Hierarchy-wise export for reorder status updates by agent (admin, manager, orders viewer)
router.get('/reorder-updates/export', protect, authorize('Admin', 'Super Admin', 'admin', 'Manager', 'manager', 'Orders Viewer', 'orders viewer'), exportReorderStatusUpdates);
// Hierarchy-wise export for order status updates (admin, manager, orders viewer)
router.get('/order-status/export', protect, authorize('Admin', 'Super Admin', 'admin', 'Manager', 'manager', 'Orders Viewer', 'orders viewer'), exportOrderStatusUpdates);
// JSON list endpoints (agents also allowed; hierarchy handled in controller)
router.get('/followup-updates', protect, listFollowupStatusUpdates);
router.get('/reorder-updates', protect, listReorderStatusUpdates);
router.get('/order-status', protect, listOrderStatusUpdates);
router.get('/followup-counts-hierarchy', protect, getFollowupCountsHierarchy);

// Dashboard Reports
// Top 10 Daily Agents (by Orders)
router.get('/top-agents', protect, authorize('Admin', 'Super Admin', 'admin'), getTopAgents);
// Active User Report
router.get('/active-users', protect, authorize('Admin', 'Super Admin', 'admin'), getActiveUsers);

// Chart Data Reports
router.get('/weekly-orders', protect, getWeeklyOrderStats);
router.get('/call-outcomes', protect, getCallOutcomeStats);

module.exports = router;
