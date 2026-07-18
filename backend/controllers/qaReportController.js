const path = require('path');
const { importFile, getImportHistory, clearBatch } = require('../services/qaImportService');
const {
  getSummary, getAgentSummary, getAgentDetail, getCategorySummary,
  getTrendData, getFilterOptions, getDataIssues
} = require('../services/qaReportService');
const { exportFullReport, exportAgentCoachingSheet } = require('../services/qaExportService');
const { sequelize } = require('../config/db');

// GET /api/reports/qa-improvement/summary
exports.getSummary = async (req, res) => {
  try {
    const filters = {
      fromDate: req.query.fromDate || req.query.from || null,
      toDate: req.query.toDate || req.query.to || null,
      team: req.query.team || null,
      campaign: req.query.campaign || null
    };
    const summary = await getSummary(filters);
    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('QA summary failed:', error);
    res.status(500).json({ success: false, message: 'Failed to get QA summary', error: error.message });
  }
};

// GET /api/reports/qa-improvement/agents
exports.getAgents = async (req, res) => {
  try {
    const filters = {
      fromDate: req.query.fromDate || req.query.from || null,
      toDate: req.query.toDate || req.query.to || null,
      agentName: req.query.agentName || null,
      team: req.query.team || null,
      campaign: req.query.campaign || null,
      auditor: req.query.auditor || null
    };
    const pagination = {
      page: parseInt(req.query.page, 10) || 1,
      pageSize: Math.min(100, parseInt(req.query.pageSize, 10) || 50),
      sortBy: req.query.sortBy || 'total_missing_points',
      sortOrder: req.query.sortOrder || 'desc'
    };
    const result = await getAgentSummary(filters, pagination);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('QA agent summary failed:', error);
    res.status(500).json({ success: false, message: 'Failed to get agent summary', error: error.message });
  }
};

// GET /api/reports/qa-improvement/agents/:agentId
exports.getAgentDetail = async (req, res) => {
  try {
    const agentName = decodeURIComponent(req.params.agentId);
    const filters = {
      fromDate: req.query.fromDate || null,
      toDate: req.query.toDate || null
    };
    const detail = await getAgentDetail(agentName, filters);
    res.json({ success: true, data: detail });
  } catch (error) {
    console.error('QA agent detail failed:', error);
    res.status(500).json({ success: false, message: 'Failed to get agent detail', error: error.message });
  }
};

// GET /api/reports/qa-improvement/categories
exports.getCategories = async (req, res) => {
  try {
    const filters = {
      fromDate: req.query.fromDate || null,
      toDate: req.query.toDate || null,
      team: req.query.team || null,
      campaign: req.query.campaign || null
    };
    const categories = await getCategorySummary(filters);
    res.json({ success: true, data: categories });
  } catch (error) {
    console.error('QA categories failed:', error);
    res.status(500).json({ success: false, message: 'Failed to get categories', error: error.message });
  }
};

// GET /api/reports/qa-improvement/trend
exports.getTrend = async (req, res) => {
  try {
    const filters = {
      fromDate: req.query.fromDate || null,
      toDate: req.query.toDate || null,
      team: req.query.team || null,
      campaign: req.query.campaign || null
    };
    const trend = await getTrendData(filters);
    res.json({ success: true, data: trend });
  } catch (error) {
    console.error('QA trend failed:', error);
    res.status(500).json({ success: false, message: 'Failed to get trend data', error: error.message });
  }
};

// GET /api/reports/qa-improvement/filter-options
exports.getFilterOptions = async (req, res) => {
  try {
    const options = await getFilterOptions();
    res.json({ success: true, data: options });
  } catch (error) {
    console.error('QA filter options failed:', error);
    res.status(500).json({ success: false, message: 'Failed to get filter options', error: error.message });
  }
};

// GET /api/reports/qa-improvement/data-issues
exports.getDataIssues = async (req, res) => {
  try {
    const filters = {
      fromDate: req.query.fromDate || null,
      toDate: req.query.toDate || null
    };
    const issues = await getDataIssues(filters);
    res.json({ success: true, data: issues });
  } catch (error) {
    console.error('QA data issues failed:', error);
    res.status(500).json({ success: false, message: 'Failed to get data issues', error: error.message });
  }
};

// POST /api/reports/qa-improvement/import
exports.importData = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const filePath = req.file.path;
    const result = await importFile(filePath, req.user?.id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('QA import failed:', error);
    res.status(500).json({ success: false, message: 'Failed to import data', error: error.message });
  }
};

// GET /api/reports/qa-improvement/import-history
exports.getImportHistory = async (req, res) => {
  try {
    const history = await getImportHistory();
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('QA import history failed:', error);
    res.status(500).json({ success: false, message: 'Failed to get import history', error: error.message });
  }
};

// DELETE /api/reports/qa-improvement/import/:batchId
exports.clearImport = async (req, res) => {
  try {
    const result = await clearBatch(req.params.batchId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('QA clear import failed:', error);
    res.status(500).json({ success: false, message: 'Failed to clear import', error: error.message });
  }
};

// GET /api/reports/qa-improvement/export
exports.exportReport = async (req, res) => {
  try {
    try { req.setTimeout(300000); } catch {}
    try { res.setTimeout(300000); } catch {}

    const filters = {
      fromDate: req.query.fromDate || null,
      toDate: req.query.toDate || null,
      team: req.query.team || null,
      campaign: req.query.campaign || null
    };

    const format = (req.query.format || 'full').toLowerCase();
    let buffer;

    if (format === 'coaching') {
      buffer = await exportAgentCoachingSheet(filters);
    } else {
      buffer = await exportFullReport(filters);
    }

    const filename = format === 'coaching'
      ? `qa-coaching-plan-${new Date().toISOString().slice(0, 10)}.xlsx`
      : `qa-improvement-report-${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    console.error('QA export failed:', error);
    res.status(500).json({ success: false, message: 'Failed to export report', error: error.message });
  }
};

// POST /api/reports/qa-improvement/agent-alias
exports.createAgentAlias = async (req, res) => {
  try {
    const { rawAgentName, mappedAgentName } = req.body;
    if (!rawAgentName || !mappedAgentName) {
      return res.status(400).json({ success: false, message: 'rawAgentName and mappedAgentName are required' });
    }
    const cleanRaw = rawAgentName.trim();
    const cleanMapped = mappedAgentName.trim();
    const cleanClean = cleanRaw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.qa_agent_aliases WHERE raw_agent_name = :raw)
      BEGIN
        INSERT INTO dbo.qa_agent_aliases (raw_agent_name, clean_agent_name, mapped_agent_name, created_by, created_at)
        VALUES (:raw, :clean, :mapped, :userId, SYSUTCDATETIME())
      END
      ELSE
      BEGIN
        UPDATE dbo.qa_agent_aliases
        SET mapped_agent_name = :mapped, clean_agent_name = :clean
        WHERE raw_agent_name = :raw
      END
    `, {
      replacements: {
        raw: cleanRaw,
        clean: cleanClean,
        mapped: cleanMapped,
        userId: req.user?.id || null
      }
    });

    res.json({ success: true, message: 'Agent alias created/updated' });
  } catch (error) {
    console.error('QA agent alias failed:', error);
    res.status(500).json({ success: false, message: 'Failed to create agent alias', error: error.message });
  }
};

// GET /api/reports/qa-improvement/aliases
exports.getAliases = async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      'SELECT * FROM dbo.qa_agent_aliases ORDER BY created_at DESC'
    );
    res.json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('QA aliases failed:', error);
    res.status(500).json({ success: false, message: 'Failed to get aliases', error: error.message });
  }
};

// DELETE /api/reports/qa-improvement/aliases/:id
exports.deleteAlias = async (req, res) => {
  try {
    await sequelize.query('DELETE FROM dbo.qa_agent_aliases WHERE id = :id', {
      replacements: { id: parseInt(req.params.id, 10) }
    });
    res.json({ success: true, message: 'Alias deleted' });
  } catch (error) {
    console.error('QA delete alias failed:', error);
    res.status(500).json({ success: false, message: 'Failed to delete alias', error: error.message });
  }
};

// POST /api/reports/qa-improvement/config
exports.updateConfig = async (req, res) => {
  try {
    const { configKey, configValue } = req.body;
    if (!configKey || configValue === undefined) {
      return res.status(400).json({ success: false, message: 'configKey and configValue are required' });
    }
    const validKeys = ['negative_keywords', 'blank_na_keywords', 'column_mapping'];
    if (!validKeys.includes(configKey)) {
      return res.status(400).json({ success: false, message: `Invalid configKey. Valid: ${validKeys.join(', ')}` });
    }

    const jsonValue = typeof configValue === 'string' ? configValue : JSON.stringify(configValue);

    await sequelize.query(`
      IF EXISTS (SELECT 1 FROM dbo.qa_report_config WHERE config_key = :key)
        UPDATE dbo.qa_report_config SET config_value_json = :value, updated_by = :userId, updated_at = SYSUTCDATETIME() WHERE config_key = :key
      ELSE
        INSERT INTO dbo.qa_report_config (config_key, config_value_json, updated_by, updated_at) VALUES (:key, :value, :userId, SYSUTCDATETIME())
    `, {
      replacements: {
        key: configKey,
        value: jsonValue,
        userId: req.user?.id || null
      }
    });

    res.json({ success: true, message: 'Config updated' });
  } catch (error) {
    console.error('QA config update failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update config', error: error.message });
  }
};

// GET /api/reports/qa-improvement/config
exports.getConfig = async (req, res) => {
  try {
    const [rows] = await sequelize.query('SELECT config_key, config_value_json FROM dbo.qa_report_config');
    const config = {};
    for (const row of (rows || [])) {
      try {
        config[row.config_key] = JSON.parse(row.config_value_json);
      } catch {
        config[row.config_key] = row.config_value_json;
      }
    }
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('QA config get failed:', error);
    res.status(500).json({ success: false, message: 'Failed to get config', error: error.message });
  }
};
