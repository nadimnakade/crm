const xlsx = require('xlsx');
const { getSummary, getAgentSummary, getCategorySummary, getAgentDetail, getDataIssues } = require('./qaReportService');

function formatHeaderRow(ws, range) {
  // Bold headers are handled by xlsx styling
}

async function exportFullReport(filters) {
  const wb = xlsx.utils.book_new();

  // Sheet 1: Executive Summary
  const summary = await getSummary(filters);
  const summaryData = [
    ['QA Improvement Report - Executive Summary'],
    [''],
    ['Generated At', new Date().toISOString()],
    ['Date Range', `${filters.fromDate || 'All'} to ${filters.toDate || 'All'}`],
    ['Team', filters.team || 'All'],
    ['Campaign', filters.campaign || 'All'],
    [''],
    ['Total Audits', summary.totalAudits],
    ['Total Agents', summary.totalAgents],
    ['Total Missing Points', summary.totalMissingPoints],
    ['Avg Missing Points per Audit', summary.avgMissingPerAudit],
    ['Highest Risk Agent', summary.highestRiskAgent],
    ['Most Common Missing Point', summary.mostCommonMissingPoint]
  ];
  const ws1 = xlsx.utils.aoa_to_sheet(summaryData);
  ws1['!cols'] = [{ wch: 30 }, { wch: 40 }];
  xlsx.utils.book_append_sheet(wb, ws1, 'Executive Summary');

  // Sheet 2: Agent-wise Summary
  const agentData = await getAgentSummary(filters, { page: 1, pageSize: 1000, sortBy: 'total_missing_points', sortOrder: 'desc' });
  const agentRows = agentData.agents.map(a => ({
    'Agent Name': a.agentName,
    'Total Audits': a.totalAudits,
    'Total Missing Points': a.totalMissingPoints,
    'Missing Per Audit': a.missingPerAudit,
    'Priority Level': a.priorityLevel,
    'Top Missing Points': a.topMissingPoints,
    'Greeting Missing': (a.categoryCounts.find(c => c.category === 'Greeting / Introduction') || {}).count || 0,
    'Concern Issue': (a.categoryCounts.find(c => c.category === 'Customer Concern Issue') || {}).count || 0,
    'Sales Pitch Issue': (a.categoryCounts.find(c => c.category === 'Sales Pitch Issue') || {}).count || 0,
    'USP Missing': (a.categoryCounts.find(c => c.category === 'USP Not Given') || {}).count || 0,
    'Substitute Missing': (a.categoryCounts.find(c => c.category === 'Substitute Not Informed') || {}).count || 0,
    'Lab Info Missing': (a.categoryCounts.find(c => c.category === 'Lab Info Not Shared') || {}).count || 0,
    'Follow-up Missing': (a.categoryCounts.find(c => c.category === 'Follow-up Date Not Provided') || {}).count || 0,
    'Tone Issue': (a.categoryCounts.find(c => c.category === 'Tone / Confidence Issue') || {}).count || 0,
    'Area of Improvement': a.areaOfImprovement,
    'Coaching Action': a.coachingAction
  }));
  const ws2 = xlsx.utils.json_to_sheet(agentRows);
  ws2['!cols'] = [
    { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
    { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
    { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 60 }, { wch: 60 }
  ];
  xlsx.utils.book_append_sheet(wb, ws2, 'Agent-wise Summary');

  // Sheet 3: Missing Point Category Summary
  const catData = await getCategorySummary(filters);
  const catRows = catData.map(c => ({
    'Category': c.category,
    'Total Count': c.totalCount,
    'Affected Agents': c.affectedAgents
  }));
  const ws3 = xlsx.utils.json_to_sheet(catRows.length ? catRows : [{ Category: 'No data', 'Total Count': 0, 'Affected Agents': 0 }]);
  ws3['!cols'] = [{ wch: 35 }, { wch: 15 }, { wch: 18 }];
  xlsx.utils.book_append_sheet(wb, ws3, 'Category Summary');

  // Sheet 4: Agent Detail Records
  const detailRows = [];
  for (const agent of agentData.agents.slice(0, 50)) {
    const detail = await getAgentDetail(agent.agentName, filters);
    for (const audit of detail.audits) {
      detailRows.push({
        'Agent Name': agent.agentName,
        'Call Date': audit.call_date,
        'Customer Name': audit.customer_name,
        'Lead ID': audit.lead_id,
        'Auditor': audit.auditor_name,
        'QA Score': audit.qa_score,
        'Missing Count': audit.missing_count,
        'Remarks': audit.remarks
      });
    }
  }
  const ws4 = xlsx.utils.json_to_sheet(detailRows.length ? detailRows : [{ Note: 'No audit records' }]);
  ws4['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 40 }];
  xlsx.utils.book_append_sheet(wb, ws4, 'Agent Detail Records');

  // Sheet 5: Data Issues
  const dataIssues = await getDataIssues(filters);
  const ws5 = xlsx.utils.json_to_sheet(dataIssues.length ? dataIssues.map(d => ({
    'Raw Agent Name': d.agent_name_raw,
    'Clean Name': d.agent_name_clean,
    'Record Count': d.count
  })) : [{ Note: 'No data issues found' }]);
  ws5['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }];
  xlsx.utils.book_append_sheet(wb, ws5, 'Data Issues');

  // Sheet 6: Coaching Action Plan
  const coachingRows = agentData.agents
    .filter(a => a.priorityLevel === 'Very High' || a.priorityLevel === 'High')
    .map(a => ({
      'Agent Name': a.agentName,
      'Priority': a.priorityLevel,
      'Missing Points': a.totalMissingPoints,
      'Missing/Audit': a.missingPerAudit,
      'Main Issues': a.topMissingPoints,
      'Area of Improvement': a.areaOfImprovement,
      'Recommended Action': a.coachingAction
    }));
  const ws6 = xlsx.utils.json_to_sheet(coachingRows.length ? coachingRows : [{ Note: 'No high-priority agents found' }]);
  ws6['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 40 }, { wch: 60 }, { wch: 60 }];
  xlsx.utils.book_append_sheet(wb, ws6, 'Coaching Action Plan');

  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf;
}

async function exportAgentCoachingSheet(filters) {
  const wb = xlsx.utils.book_new();
  const agentData = await getAgentSummary(filters, { page: 1, pageSize: 1000, sortBy: 'total_missing_points', sortOrder: 'desc' });

  const coachingRows = agentData.agents
    .filter(a => a.priorityLevel !== 'Low')
    .map(a => ({
      'Agent Name': a.agentName,
      'Priority Level': a.priorityLevel,
      'Total Audits': a.totalAudits,
      'Total Missing Points': a.totalMissingPoints,
      'Missing/Audit': a.missingPerAudit,
      'Main Missing Points': a.topMissingPoints,
      'Area of Improvement': a.areaOfImprovement,
      'Coaching Action': a.coachingAction
    }));

  const ws = xlsx.utils.json_to_sheet(coachingRows.length ? coachingRows : [{ Note: 'No coaching data' }]);
  ws['!cols'] = [
    { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 14 },
    { wch: 50 }, { wch: 60 }, { wch: 60 }
  ];
  xlsx.utils.book_append_sheet(wb, ws, 'Coaching Plan');

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { exportFullReport, exportAgentCoachingSheet };
