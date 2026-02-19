const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const upload = require('../utils/orderUpload');
const { protect } = require('../middleware/auth'); // Assuming auth middleware exists

// Upload bulk orders
router.post('/uploadOrders', protect, upload.single('file'), orderController.uploadOrders);

// Download template
router.get('/template', protect, orderController.downloadTemplate);

// Get re-orders for today
router.get('/reorders', protect, orderController.getReorders);

// Get re-orders count for today
router.get('/reorders/count', protect, orderController.getReordersCount);

// Get uploaded orders history
router.get('/uploaded', protect, orderController.getUploadedOrders);

// Update order status
router.put('/:id/status', protect, orderController.updateOrderStatus);

module.exports = router;