const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const upload = require('../utils/portfolioUpload');
const { uploadPortfolio, listPortfolio } = require('../controllers/portfolioController');

router.get('/', protect, listPortfolio);
router.post('/upload', protect, upload.array('files', 10), uploadPortfolio);

module.exports = router;