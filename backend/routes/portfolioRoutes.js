const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const upload = require('../utils/portfolioUpload');
const { uploadPortfolio, listPortfolio, exportPortfolio } = require('../controllers/portfolioController');

router.get('/', protect, listPortfolio);
router.get('/export', protect, authorize('Admin', 'Super Admin', 'admin'), exportPortfolio);
router.post('/upload', protect, upload.array('files', 10), uploadPortfolio);

module.exports = router;