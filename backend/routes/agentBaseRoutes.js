const express = require('express');
const router = express.Router();
const agentBaseController = require('../controllers/agentBaseController');
const { protect } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Upload route (Admin only? Or anyone with permission?)
// User said "admin/superadmin will see all", implies maybe they upload too.
router.post('/upload', protect, upload.single('file'), agentBaseController.uploadAgentBase);

// List route
router.get('/', protect, agentBaseController.getAgentBase);

module.exports = router;
