const express = require('express');
const router = express.Router();
const { initiateCall, handleWebhook } = require('../controllers/smartfloController');
const { protect } = require('../middleware/auth');

// Click-to-call endpoint (protected)
router.post('/click-to-call', protect, initiateCall);

// Webhook endpoint (public for Smartflo callback)
// Note: Ensure this route is accessible from the internet (e.g. ngrok for local dev)
router.post('/smartflo-webhook', handleWebhook);

module.exports = router;
