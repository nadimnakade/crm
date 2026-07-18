const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { sequelize } = require('../config/db');
const { cleanAgentName, getAliases, applyAlias } = require('./agentNormalizationService');
const { analyzeAuditRow, getConfig } = require('./qaMissingPointAnalyzer');

async function getColumnMapping() {
  try {
    const [rows] = await sequelize.query(
      "SELECT config_value_json FROM dbo.qa_report_config WHERE config_key = 'column_mapping'"
    );
    if (rows && rows.length) {
      return JSON.parse(rows[0].config_value_json || '{}');
    }
  } catch {}
  return {
    'Agent Name': 'agent_name',
    'Call Date': 'call_date',
    'Lead ID': 'lead_id',
    'Customer Name': 'customer_name',
    'Mobile Number': 'mobile_number',
    'QA Auditor': 'auditor_name',
    'Campaign': 'campaign',
    'Team': 'team',
    'Greeting': 'greeting',
    'Customer Concern': 'customer_concern',
    'Probing / Sales Pitch': 'probing_sales_pitch',
    'USP': 'usp_given',
    'Substitute': 'substitute_informed',
    'Lab Info': 'lab_info_shared',
    'Follow Up': 'followup_date_provided',
    'Tone': 'tone_confidence',
    'QA Score': 'qa_score',
    'Remarks': 'remarks'
  };
}

function mapRow(rawRow, columnMapping) {
  const mapped = {};
  for (const [csvCol, dbField] of Object.entries(columnMapping)) {
    if (rawRow[csvCol] !== undefined) {
      mapped[dbField] = rawRow[csvCol];
    }
  }
  return mapped;
}

function detectColumns(headers, columnMapping) {
  const mapped = [];
  const unmapped = [];
  for (const h of headers) {
    if (columnMapping[h]) {
      mapped.push({ original: h, mapped: columnMapping[h] });
    } else {
      unmapped.push(h);
    }
  }
  return { mapped, unmapped };
}

async function importFile(filePath, uploadedBy) {
  const ext = path.extname(filePath).toLowerCase();
  let workbook;

  if (ext === '.csv') {
    workbook = xlsx.readFile(filePath, { type: 'file' });
  } else if (ext === '.xlsx' || ext === '.xls') {
    workbook = xlsx.readFile(filePath, { type: 'file' });
  } else {
    throw new Error('Unsupported file format. Only CSV and XLSX files are allowed.');
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const jsonData = xlsx.utils.sheet_to_json(sheet, { defval: '' });

  if (!jsonData.length) {
    throw new Error('File is empty or has no data rows.');
  }

  const headers = Object.keys(jsonData[0]);
  const columnMapping = await getColumnMapping();
  const { mapped, unmapped } = detectColumns(headers, columnMapping);

  const config = await getConfig();
  const aliases = await getAliases();

  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  let importedCount = 0;
  let skippedCount = 0;
  const errors = [];
  const agentNames = new Set();

  const BATCH_SIZE = 100;

  for (let i = 0; i < jsonData.length; i += BATCH_SIZE) {
    const batch = jsonData.slice(i, i + BATCH_SIZE);
    const auditValues = [];
    const missingPointBatch = [];

    for (const rawRow of batch) {
      try {
        const mappedRow = mapRow(rawRow, columnMapping);
        const agentRaw = String(mappedRow.agent_name || '').trim();
        const { clean: agentClean, isInvalid, reason } = cleanAgentName(agentRaw);
        const finalAgent = applyAlias(agentClean, aliases);
        agentNames.add(finalAgent);

        if (isInvalid && !finalAgent) {
          skippedCount++;
          continue;
        }

        const { missingPoints, blankCount } = analyzeAuditRow(mappedRow, config);

        const rowIdx = importedCount + 1;
        auditValues.push({
          agent_name_raw: agentRaw,
          agent_name_clean: finalAgent || 'Data Issue',
          call_date: String(mappedRow.call_date || ''),
          lead_id: String(mappedRow.lead_id || ''),
          customer_name: String(mappedRow.customer_name || ''),
          mobile_number: String(mappedRow.mobile_number || ''),
          auditor_name: String(mappedRow.auditor_name || ''),
          campaign: String(mappedRow.campaign || ''),
          team: String(mappedRow.team || ''),
          greeting: typeof mappedRow.greeting === 'number' ? mappedRow.greeting : (mappedRow.greeting ? 0 : 1),
          customer_concern: typeof mappedRow.customer_concern === 'number' ? mappedRow.customer_concern : (mappedRow.customer_concern ? 0 : 1),
          probing_sales_pitch: typeof mappedRow.probing_sales_pitch === 'number' ? mappedRow.probing_sales_pitch : (mappedRow.probing_sales_pitch ? 0 : 1),
          usp_given: typeof mappedRow.usp_given === 'number' ? mappedRow.usp_given : (mappedRow.usp_given ? 0 : 1),
          substitute_informed: typeof mappedRow.substitute_informed === 'number' ? mappedRow.substitute_informed : (mappedRow.substitute_informed ? 0 : 1),
          lab_info_shared: typeof mappedRow.lab_info_shared === 'number' ? mappedRow.lab_info_shared : (mappedRow.lab_info_shared ? 0 : 1),
          followup_date_provided: typeof mappedRow.followup_date_provided === 'number' ? mappedRow.followup_date_provided : (mappedRow.followup_date_provided ? 0 : 1),
          tone_confidence: typeof mappedRow.tone_confidence === 'number' ? mappedRow.tone_confidence : (mappedRow.tone_confidence ? 0 : 1),
          compliance_process: typeof mappedRow.compliance_process === 'number' ? mappedRow.compliance_process : (mappedRow.compliance_process ? 0 : 1),
          qa_score: String(mappedRow.qa_score || ''),
          remarks: String(mappedRow.remarks || ''),
          raw_data_json: JSON.stringify(rawRow),
          import_batch_id: batchId
        });

        for (const mp of missingPoints) {
          missingPointBatch.push({
            agent_name_clean: finalAgent || 'Data Issue',
            category: mp.category,
            is_missing: mp.is_missing,
            source_field: mp.source_field,
            source_value: mp.source_value,
            severity: mp.severity
          });
        }

        importedCount++;
      } catch (err) {
        skippedCount++;
        errors.push(`Row ${i + skippedCount}: ${err.message}`);
      }
    }

    // Insert batch
    if (auditValues.length) {
      try {
        await sequelize.query(`
          INSERT INTO dbo.qa_audits 
          (agent_name_raw, agent_name_clean, call_date, lead_id, customer_name, mobile_number, 
           auditor_name, campaign, team, greeting, customer_concern, probing_sales_pitch, 
           usp_given, substitute_informed, lab_info_shared, followup_date_provided, 
           tone_confidence, compliance_process, qa_score, remarks, raw_data_json, import_batch_id)
          VALUES 
          ${auditValues.map((_, idx) => `(:agent_name_raw_${idx}, :agent_name_clean_${idx}, :call_date_${idx}, :lead_id_${idx}, :customer_name_${idx}, :mobile_number_${idx}, 
           :auditor_name_${idx}, :campaign_${idx}, :team_${idx}, :greeting_${idx}, :customer_concern_${idx}, :probing_sales_pitch_${idx}, 
           :usp_given_${idx}, :substitute_informed_${idx}, :lab_info_shared_${idx}, :followup_date_provided_${idx}, 
           :tone_confidence_${idx}, :compliance_process_${idx}, :qa_score_${idx}, :remarks_${idx}, :raw_data_json_${idx}, :import_batch_id_${idx})`).join(',\n')}
        `, auditValues.reduce((acc, v, idx) => {
          for (const [key, val] of Object.entries(v)) {
            acc[`${key}_${idx}`] = val;
          }
          return acc;
        }, {}));
      } catch (dbErr) {
        errors.push(`DB insert error: ${dbErr.message}`);
      }
    }
  }

  return {
    batchId,
    importedCount,
    skippedCount,
    totalRows: jsonData.length,
    agentsFound: Array.from(agentNames),
    columnsDetected: { mapped, unmapped },
    errors: errors.slice(0, 20)
  };
}

async function getImportHistory() {
  try {
    const [rows] = await sequelize.query(`
      SELECT import_batch_id, 
             COUNT(*) as total_rows,
             MIN(created_at) as imported_at,
             COUNT(DISTINCT agent_name_clean) as agent_count
      FROM dbo.qa_audits
      WHERE import_batch_id IS NOT NULL
      GROUP BY import_batch_id
      ORDER BY MIN(created_at) DESC
    `);
    return rows || [];
  } catch {
    return [];
  }
}

async function clearBatch(batchId) {
  if (!batchId) throw new Error('batchId is required');
  try {
    const [audits] = await sequelize.query(
      'SELECT id FROM dbo.qa_audits WHERE import_batch_id = :batchId',
      { replacements: { batchId } }
    );
    if (audits && audits.length) {
      const ids = audits.map(a => a.id);
      await sequelize.query(
        `DELETE FROM dbo.qa_missing_points WHERE qa_audit_id IN (${ids.join(',')})`
      );
    }
    const [result] = await sequelize.query(
      'DELETE FROM dbo.qa_audits WHERE import_batch_id = :batchId',
      { replacements: { batchId } }
    );
    return { deleted: audits ? audits.length : 0 };
  } catch (err) {
    throw new Error(`Failed to clear batch: ${err.message}`);
  }
}

module.exports = { importFile, getImportHistory, clearBatch, getColumnMapping, detectColumns };
