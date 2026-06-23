const express = require('express');
const router = express.Router();
const { getCalls, getCallById, createCall, updateCall, deleteCall, getRecentCalls, getTopCallersDaily, getTopCallersWeekly, getFollowUps, updateFollowUpStatus, uploadFollowUps, getUploadedFollowUps, getUploadedOrderFollowUps, getImportantCalls, transferFollowup, getCustomerStatusHistory } = require('../controllers/callController');
const { getCallFiles, getCallHistory, getCallFilesSource, getCallHistorySource } = require('../controllers/callController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../utils/fileUpload');
const followupsUpload = require('../utils/followupUpload');
const { CallAttachment } = require('../models');

// Call routes
router.get('/followups', protect, getFollowUps);
router.put('/:id/followup-status', protect, updateFollowUpStatus);
router.post('/followups/upload', protect, authorize('Admin', 'Super Admin', 'admin'), followupsUpload.single('file'), uploadFollowUps);
router.get('/followups/uploaded', protect, getUploadedFollowUps);
router.get('/followups/orders', protect, getUploadedOrderFollowUps);
router.get('/followups/important-calls', protect, getImportantCalls);
router.put('/:id/transfer-followup', protect, authorize('Admin', 'Super Admin', 'admin'), transferFollowup);

router.route('/')
  .get(protect, getCalls)
  .post(protect, createCall);

// Analytics routes for dashboard
router.get('/recent', protect, getRecentCalls);
router.get('/top-callers/daily', protect, getTopCallersDaily);
router.get('/top-callers/weekly', protect, getTopCallersWeekly);

// Recent order details (today)
router.get('/orders/recent', protect, require('../controllers/callController').getRecentOrderDetails);
// Alias for recent order details to match frontend call
router.get('/recent-order-details', protect, require('../controllers/callController').getRecentOrderDetails);

// Recent order count (today) — lightweight
router.get('/orders/recent/count', protect, require('../controllers/callController').getRecentOrderCount);
// Followup report (today through next month)
router.get('/orders/followups', protect, require('../controllers/callController').getFollowupReport);

// Due follow-ups
router.get('/follow-ups/due', protect, require('../controllers/callController').getDueFollowUps);

router.get('/customer/:customerId/status-history', protect, getCustomerStatusHistory);

router.route('/:id')
  .get(protect, getCallById)
  .put(protect, authorize('Admin', 'Super Admin', 'admin'), updateCall)
  .delete(protect, authorize('Admin', 'Super Admin', 'admin'), deleteCall);

// Files and status history
router.get('/:id/files', protect, getCallFiles);
router.get('/:id/history', protect, getCallHistory);
// Diagnostics (admin-only, enforced in controller)
router.get('/:id/files/source', protect, getCallFilesSource);
router.get('/:id/history/source', protect, getCallHistorySource);

// File upload routes
router.post('/:id/upload/medicine', protect, upload.single('medicineList'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const filePath = `/api/uploads/call-${req.params.id}/${req.file.filename}`;
    // Insert attachment row
    CallAttachment.create({
      CallId: parseInt(req.params.id, 10),
      Type: 'medicine',
      FileName: req.file.originalname,
      FilePath: filePath,
      UploadedBy: req.user ? req.user.id : null
    }).catch(err => console.error('Failed to insert attachment:', err));
    res.status(200).json({ message: 'Medicine list uploaded successfully', filePath });
  } catch (error) {
    res.status(500).json({ message: 'Error uploading file', error: error.message });
  }
});

router.post('/:id/upload/prescription', protect, upload.single('prescription'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const filePath = `/api/uploads/call-${req.params.id}/${req.file.filename}`;
    CallAttachment.create({
      CallId: parseInt(req.params.id, 10),
      Type: 'prescription',
      FileName: req.file.originalname,
      FilePath: filePath,
      UploadedBy: req.user ? req.user.id : null
    }).catch(err => console.error('Failed to insert attachment:', err));
    res.status(200).json({ message: 'Prescription uploaded successfully', filePath });
  } catch (error) {
    res.status(500).json({ message: 'Error uploading file', error: error.message });
  }
});

router.post('/:id/upload/document', protect, upload.single('document'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const filePath = `/api/uploads/call-${req.params.id}/${req.file.filename}`;
    CallAttachment.create({
      CallId: parseInt(req.params.id, 10),
      Type: 'document',
      FileName: req.file.originalname,
      FilePath: filePath,
      UploadedBy: req.user ? req.user.id : null
    }).catch(err => console.error('Failed to insert attachment:', err));
    res.status(200).json({ message: 'Document uploaded successfully', filePath });
  } catch (error) {
    res.status(500).json({ message: 'Error uploading file', error: error.message });
  }
});

module.exports = router;

