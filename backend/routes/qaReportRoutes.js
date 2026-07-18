const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const qaFileUpload = require('../utils/qaFileUpload');
const controller = require('../controllers/qaReportController');

// Admin-only access for most QA report endpoints
const qaAccess = [
  protect,
  authorize('Admin', 'Super Admin', 'admin', 'Manager', 'manager', 'QA Head', 'Team Lead')
];

// Summary & Dashboard
router.get('/qa-improvement/summary', qaAccess, controller.getSummary);
router.get('/qa-improvement/filter-options', qaAccess, controller.getFilterOptions);

// Agent data
router.get('/qa-improvement/agents', qaAccess, controller.getAgents);
router.get('/qa-improvement/agents/:agentId', qaAccess, controller.getAgentDetail);

// Categories & trends
router.get('/qa-improvement/categories', qaAccess, controller.getCategories);
router.get('/qa-improvement/trend', qaAccess, controller.getTrend);

// Data issues
router.get('/qa-improvement/data-issues', qaAccess, controller.getDataIssues);

// Import
router.post('/qa-improvement/import', qaAccess, qaFileUpload.single('file'), controller.importData);
router.get('/qa-improvement/import-history', qaAccess, controller.getImportHistory);
router.delete('/qa-improvement/import/:batchId', qaAccess, controller.clearImport);

// Export
router.get('/qa-improvement/export', qaAccess, controller.exportReport);

// Agent alias management
router.get('/qa-improvement/aliases', qaAccess, controller.getAliases);
router.post('/qa-improvement/agent-alias', qaAccess, controller.createAgentAlias);
router.delete('/qa-improvement/aliases/:id', qaAccess, controller.deleteAlias);

// Config management
router.get('/qa-improvement/config', qaAccess, controller.getConfig);
router.post('/qa-improvement/config', qaAccess, controller.updateConfig);

module.exports = router;
