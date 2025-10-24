const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { exportInteractions } = require('../controllers/reportController');

// Admin-only export for customer-wise interaction logs
router.get('/interactions/export', protect, authorize('Admin', 'Super Admin', 'admin'), exportInteractions);

module.exports = router;