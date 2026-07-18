const { sequelize } = require('../config/db');
const { Op } = require('sequelize');

function buildWhereClause(filters) {
  const conditions = [];
  const params = {};

  if (filters.fromDate) {
    conditions.push('call_date >= :fromDate');
    params.fromDate = filters.fromDate;
  }
  if (filters.toDate) {
    conditions.push('call_date <= :toDate');
    params.toDate = filters.toDate;
  }
  if (filters.agentName) {
    conditions.push('agent_name_clean LIKE :agentName');
    params.agentName = `%${filters.agentName}%`;
  }
  if (filters.team) {
    conditions.push('team = :team');
    params.team = filters.team;
  }
  if (filters.campaign) {
    conditions.push('campaign = :campaign');
    params.campaign = filters.campaign;
  }
  if (filters.auditor) {
    conditions.push('auditor_name LIKE :auditor');
    params.auditor = `%${filters.auditor}%`;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

async function getSummary(filters) {
  const { where, params } = buildWhereClause(filters);

  const [auditStats] = await sequelize.query(`
    SELECT 
      COUNT(*) as totalAudits,
      COUNT(DISTINCT agent_name_clean) as totalAgents,
      ISNULL(AVG(CAST(greeting + customer_concern + probing_sales_pitch + usp_given + substitute_informed + lab_info_shared + followup_date_provided + tone_confidence AS FLOAT)), 0) as avgMissingPerAudit
    FROM dbo.qa_audits
    ${where}
  `, { replacements: params });

  const [missingStats] = await sequelize.query(`
    SELECT COUNT(*) as totalMissingPoints
    FROM dbo.qa_missing_points mp
    INNER JOIN dbo.qa_audits a ON a.id = mp.qa_audit_id
    ${where.replace('call_date', 'a.call_date')}
    ${where.includes('agent_name_clean') ? '' : ''} AND mp.is_missing = 1
    ${where ? 'AND ' + where.split('WHERE ')[1] : ''}
  `, { replacements: params });

  // Get top missing category
  const [topCategory] = await sequelize.query(`
    SELECT TOP 1 mp.category, COUNT(*) as cnt
    FROM dbo.qa_missing_points mp
    INNER JOIN dbo.qa_audits a ON a.id = mp.qa_audit_id
    WHERE mp.is_missing = 1
    ${filters.fromDate ? 'AND a.call_date >= :fromDate' : ''}
    ${filters.toDate ? 'AND a.call_date <= :toDate' : ''}
    ${filters.team ? 'AND a.team = :team' : ''}
    ${filters.campaign ? 'AND a.campaign = :campaign' : ''}
    GROUP BY mp.category
    ORDER BY cnt DESC
  `, { replacements: params });

  // Get highest risk agent
  const [riskAgent] = await sequelize.query(`
    SELECT TOP 1 a.agent_name_clean, COUNT(*) as missingCount
    FROM dbo.qa_missing_points mp
    INNER JOIN dbo.qa_audits a ON a.id = mp.qa_audit_id
    WHERE mp.is_missing = 1
    ${filters.fromDate ? 'AND a.call_date >= :fromDate' : ''}
    ${filters.toDate ? 'AND a.call_date <= :toDate' : ''}
    ${filters.team ? 'AND a.team = :team' : ''}
    ${filters.campaign ? 'AND a.campaign = :campaign' : ''}
    GROUP BY a.agent_name_clean
    ORDER BY missingCount DESC
  `, { replacements: params });

  const stats = (auditStats && auditStats[0]) || {};
  const missing = (missingStats && missingStats[0]) || {};

  return {
    totalAudits: stats.totalAudits || 0,
    totalAgents: stats.totalAgents || 0,
    totalMissingPoints: missing.totalMissingPoints || 0,
    avgMissingPerAudit: stats.avgMissingPerAudit ? Number(Number(stats.avgMissingPerAudit).toFixed(2)) : 0,
    highestRiskAgent: riskAgent && riskAgent[0] ? riskAgent[0].agent_name_clean : 'N/A',
    mostCommonMissingPoint: topCategory && topCategory[0] ? topCategory[0].category : 'N/A'
  };
}

async function getAgentSummary(filters, pagination) {
  const { where, params } = buildWhereClause(filters);

  const page = pagination.page || 1;
  const pageSize = pagination.pageSize || 50;
  const sortBy = pagination.sortBy || 'total_missing_points';
  const sortOrder = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * pageSize;

  const allowedSortColumns = [
    'agent_name_clean', 'total_audits', 'total_missing_points',
    'missing_per_audit', 'priority_level'
  ];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'total_missing_points';

  const [rows] = await sequelize.query(`
    WITH AgentStats AS (
      SELECT 
        a.agent_name_clean as agentName,
        COUNT(DISTINCT a.id) as totalAudits,
        SUM(CASE WHEN mp.is_missing = 1 THEN 1 ELSE 0 END) as totalMissingPoints,
        CAST(SUM(CASE WHEN mp.is_missing = 1 THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(DISTINCT a.id), 0) as missingPerAudit
      FROM dbo.qa_audits a
      LEFT JOIN dbo.qa_missing_points mp ON mp.qa_audit_id = a.id
      ${where}
      GROUP BY a.agent_name_clean
    )
    SELECT *,
      CASE
        WHEN missingPerAudit >= 4 OR totalMissingPoints >= 50 THEN 'Very High'
        WHEN missingPerAudit >= 3 OR totalMissingPoints >= 30 THEN 'High'
        WHEN missingPerAudit >= 1.5 OR totalMissingPoints >= 15 THEN 'Medium'
        ELSE 'Low'
      END as priorityLevel
    FROM AgentStats
    ORDER BY ${safeSortBy} ${sortOrder}
    OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
  `, { replacements: params });

  const [countResult] = await sequelize.query(`
    SELECT COUNT(DISTINCT a.agent_name_clean) as total
    FROM dbo.qa_audits a
    ${where}
  `, { replacements: params });

  // Get category breakdown for each agent
  const agentNames = rows.map(r => r.agentName).filter(Boolean);
  let categoryData = [];

  if (agentNames.length) {
    const placeholders = agentNames.map((_, i) => `:agent${i}`).join(',');
    const catParams = {};
    agentNames.forEach((name, i) => { catParams[`agent${i}`] = name; });

    [categoryData] = await sequelize.query(`
      SELECT 
        a.agent_name_clean as agentName,
        mp.category,
        COUNT(*) as count
      FROM dbo.qa_missing_points mp
      INNER JOIN dbo.qa_audits a ON a.id = mp.qa_audit_id
      WHERE mp.is_missing = 1 AND a.agent_name_clean IN (${placeholders})
      GROUP BY a.agent_name_clean, mp.category
    `, { replacements: catParams });
  }

  const categories = [
    'Greeting / Introduction', 'Customer Concern Issue', 'Sales Pitch Issue',
    'USP Not Given', 'Substitute Not Informed', 'Lab Info Not Shared',
    'Follow-up Date Not Provided', 'Tone / Confidence Issue', 'Compliance / Process Issue'
  ];

  const enriched = rows.map(row => {
    const agentCats = categoryData.filter(c => c.agentName === row.agentName);
    const catMap = {};
    for (const c of agentCats) {
      catMap[c.category] = c.count;
    }

    const catCounts = categories.map(cat => ({
      category: cat,
      count: catMap[cat] || 0
    }));

    const topMissing = catCounts
      .filter(c => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(c => c.category);

    return {
      ...row,
      missingPerAudit: row.missingPerAudit ? Number(Number(row.missingPerAudit).toFixed(2)) : 0,
      categoryCounts: catCounts,
      topMissingPoints: topMissing.join(', ') || 'None',
      areaOfImprovement: generateImprovementText(catCounts),
      coachingAction: generateCoachingAction(catCounts)
    };
  });

  return {
    agents: enriched,
    total: (countResult && countResult[0] ? countResult[0].total : 0),
    page,
    pageSize
  };
}

async function getAgentDetail(agentName, filters) {
  const params = { agentName };

  let dateFilter = '';
  if (filters.fromDate) {
    dateFilter += ' AND a.call_date >= :fromDate';
    params.fromDate = filters.fromDate;
  }
  if (filters.toDate) {
    dateFilter += ' AND a.call_date <= :toDate';
    params.toDate = filters.toDate;
  }

  const [audits] = await sequelize.query(`
    SELECT a.*, 
      (SELECT COUNT(*) FROM dbo.qa_missing_points mp WHERE mp.qa_audit_id = a.id AND mp.is_missing = 1) as missing_count
    FROM dbo.qa_audits a
    WHERE a.agent_name_clean = :agentName
    ${dateFilter}
    ORDER BY a.call_date DESC
  `, { replacements: params });

  const [catSummary] = await sequelize.query(`
    SELECT mp.category, COUNT(*) as count
    FROM dbo.qa_missing_points mp
    INNER JOIN dbo.qa_audits a ON a.id = mp.qa_audit_id
    WHERE a.agent_name_clean = :agentName AND mp.is_missing = 1
    ${dateFilter.replace(/a\./g, 'a.')}
    GROUP BY mp.category
    ORDER BY count DESC
  `, { replacements: params });

  const totalMissing = audits ? audits.reduce((sum, a) => sum + (a.missing_count || 0), 0) : 0;
  const missingPerAudit = audits && audits.length ? (totalMissing / audits.length).toFixed(2) : 0;

  return {
    agentName,
    totalAudits: audits ? audits.length : 0,
    totalMissingPoints: totalMissing,
    missingPerAudit: Number(missingPerAudit),
    categorySummary: catSummary || [],
    audits: audits || [],
    priorityLevel: getPriorityLevel(Number(missingPerAudit), totalMissing),
    areaOfImprovement: generateImprovementText(
      (catSummary || []).map(c => ({ category: c.category, count: c.count }))
    ),
    coachingAction: generateCoachingAction(
      (catSummary || []).map(c => ({ category: c.category, count: c.count }))
    )
  };
}

async function getCategorySummary(filters) {
  const { where, params } = buildWhereClause(filters);

  const [rows] = await sequelize.query(`
    SELECT 
      mp.category,
      COUNT(*) as totalCount,
      COUNT(DISTINCT a.agent_name_clean) as affectedAgents
    FROM dbo.qa_missing_points mp
    INNER JOIN dbo.qa_audits a ON a.id = mp.qa_audit_id
    WHERE mp.is_missing = 1
    ${filters.fromDate ? 'AND a.call_date >= :fromDate' : ''}
    ${filters.toDate ? 'AND a.call_date <= :toDate' : ''}
    ${filters.team ? 'AND a.team = :team' : ''}
    ${filters.campaign ? 'AND a.campaign = :campaign' : ''}
    GROUP BY mp.category
    ORDER BY totalCount DESC
  `, { replacements: params });

  return rows || [];
}

async function getTrendData(filters) {
  const { params } = buildWhereClause(filters);

  const [rows] = await sequelize.query(`
    SELECT 
      a.call_date as callDate,
      COUNT(DISTINCT a.id) as totalAudits,
      SUM(CASE WHEN mp.is_missing = 1 THEN 1 ELSE 0 END) as totalMissing
    FROM dbo.qa_audits a
    LEFT JOIN dbo.qa_missing_points mp ON mp.qa_audit_id = a.id
    WHERE a.call_date IS NOT NULL AND a.call_date != ''
    ${filters.fromDate ? 'AND a.call_date >= :fromDate' : ''}
    ${filters.toDate ? 'AND a.call_date <= :toDate' : ''}
    ${filters.team ? 'AND a.team = :team' : ''}
    ${filters.campaign ? 'AND a.campaign = :campaign' : ''}
    GROUP BY a.call_date
    ORDER BY a.call_date ASC
  `, { replacements: params });

  return rows || [];
}

async function getFilterOptions() {
  const [agents] = await sequelize.query(
    'SELECT DISTINCT agent_name_clean FROM dbo.qa_audits WHERE agent_name_clean IS NOT NULL AND agent_name_clean != \'\' ORDER BY agent_name_clean'
  );
  const [teams] = await sequelize.query(
    'SELECT DISTINCT team FROM dbo.qa_audits WHERE team IS NOT NULL AND team != \'\' ORDER BY team'
  );
  const [campaigns] = await sequelize.query(
    'SELECT DISTINCT campaign FROM dbo.qa_audits WHERE campaign IS NOT NULL AND campaign != \'\' ORDER BY campaign'
  );
  const [auditors] = await sequelize.query(
    'SELECT DISTINCT auditor_name FROM dbo.qa_audits WHERE auditor_name IS NOT NULL AND auditor_name != \'\' ORDER BY auditor_name'
  );

  return {
    agents: (agents || []).map(r => r.agent_name_clean),
    teams: (teams || []).map(r => r.team),
    campaigns: (campaigns || []).map(r => r.campaign),
    auditors: (auditors || []).map(r => r.auditor_name)
  };
}

async function getDataIssues(filters) {
  const { where, params } = buildWhereClause(filters);
  const [rows] = await sequelize.query(`
    SELECT agent_name_raw, agent_name_clean, COUNT(*) as count
    FROM dbo.qa_audits
    WHERE (agent_name_clean = 'Data Issue' OR agent_name_clean IS NULL OR agent_name_clean = '')
    ${filters.fromDate ? 'AND call_date >= :fromDate' : ''}
    ${filters.toDate ? 'AND call_date <= :toDate' : ''}
    GROUP BY agent_name_raw, agent_name_clean
  `, { replacements: params });
  return rows || [];
}

function getPriorityLevel(missingPerAudit, totalMissing) {
  if (missingPerAudit >= 4 || totalMissing >= 50) return 'Very High';
  if (missingPerAudit >= 3 || totalMissing >= 30) return 'High';
  if (missingPerAudit >= 1.5 || totalMissing >= 15) return 'Medium';
  return 'Low';
}

function generateImprovementText(catCounts) {
  if (!catCounts || !catCounts.length) return 'No data available';
  const sorted = [...catCounts].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, 3).filter(c => c.count > 0);

  if (!top.length) return 'No significant issues found';

  const textMap = {
    'Greeting / Introduction': 'Call opening: agent should start with proper greeting, name, brand introduction, and purpose of call',
    'Customer Concern Issue': 'Concern handling: agent should ask probing questions, understand customer issue, paraphrase the concern, then pitch the solution',
    'Sales Pitch Issue': 'Sales pitch structure: agent should avoid random pitching and follow a structured call flow',
    'USP Not Given': 'USP communication: agent should consistently explain unique selling points before closing the call',
    'Substitute Not Informed': 'Substitute awareness: agent should always present alternative options to the customer',
    'Lab Info Not Shared': 'Lab information: agent should share relevant lab details and product information with every customer',
    'Follow-up Date Not Provided': 'Follow-up discipline: agent should confirm next follow-up date/time and update CRM notes properly',
    'Tone / Confidence Issue': 'Voice and confidence: agent should maintain professional tone, clear speech, and confident delivery',
    'Compliance / Process Issue': 'Process adherence: agent should follow all required compliance steps and call scripts'
  };

  return top.map(c => textMap[c.category] || c.category).join('. ') + '.';
}

function generateCoachingAction(catCounts) {
  if (!catCounts || !catCounts.length) return 'Review call recordings for specific guidance';
  const sorted = [...catCounts].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, 3).filter(c => c.count > 0);

  if (!top.length) return 'Monitor calls for improvement areas';

  const actionMap = {
    'Greeting / Introduction': 'Re-train on call opening script; practice 5 greeting variations',
    'Customer Concern Issue': 'Role-play probing exercises; practice paraphrasing customer concerns',
    'Sales Pitch Issue': 'Use mandatory pitch checklist; follow structured call flow template',
    'USP Not Given': 'Review USP documentation; create USP cheat sheet for agent desk',
    'Substitute Not Informed': 'Training on product alternatives; add substitute check in call flow',
    'Lab Info Not Shared': 'Lab information briefing session; add lab info to call checklist',
    'Follow-up Date Not Provided': 'Daily follow-up date audit; CRM note hygiene training',
    'Tone / Confidence Issue': 'Tone and confidence coaching; 3-call live monitoring weekly',
    'Compliance / Process Issue': 'Process compliance workshop; create compliance checklist'
  };

  return top.map(c => actionMap[c.category] || `Training on ${c.category}`).join('; ') + '.';
}

module.exports = {
  getSummary, getAgentSummary, getAgentDetail, getCategorySummary,
  getTrendData, getFilterOptions, getDataIssues, getPriorityLevel,
  generateImprovementText, generateCoachingAction, buildWhereClause
};
