const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { exportInteractions, exportOrders, exportFollowups } = require('../controllers/reportController');

// Admin-only export for customer-wise interaction logs (include Orders Viewer)
router.get('/interactions/export', protect, authorize('Admin', 'Super Admin', 'admin', 'Orders Viewer', 'orders viewer'), exportInteractions);
// Admin-only export for order-only details (include Orders Viewer)
router.get('/orders/export', protect, authorize('Admin', 'Super Admin', 'admin', 'Orders Viewer', 'orders viewer'), exportOrders);
// Admin-only export for followup orders (include Orders Viewer)
router.get('/followups/export', protect, authorize('Admin', 'Super Admin', 'admin', 'Orders Viewer', 'orders viewer'), exportFollowups);

module.exports = router;
