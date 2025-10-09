const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const upload = require('../utils/cmdUpload');
const { uploadDetails, downloadTemplate } = require('../controllers/customerMedicineDetailController');
const { listPortfolio } = require('../controllers/portfolioController');

// Listing reuses portfolio list over CustomerPortfolio table
router.get('/', protect, listPortfolio);
// Public template download (no auth required)
router.get('/template', downloadTemplate);

// Upload accepts single field name 'file' from frontend; adapt to controller expecting files[]
router.post('/upload', protect, upload.single('file'), uploadDetails);

module.exports = router;