const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { exportInteractions, exportOrders } = require('../controllers/reportController');

// Admin-only export for customer-wise interaction logs
router.get('/interactions/export', protect, authorize('Admin', 'Super Admin', 'admin'), exportInteractions);
// Admin-only export for order-only details
router.get('/orders/export', protect, authorize('Admin', 'Super Admin', 'admin'), exportOrders);

module.exports = router;