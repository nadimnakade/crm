const { sequelize } = require('../config/db');

const CATEGORY_MAP = {
  greeting: { category: 'Greeting / Introduction', field: 'greeting' },
  customer_concern: { category: 'Customer Concern Issue', field: 'customer_concern' },
  probing_sales_pitch: { category: 'Sales Pitch Issue', field: 'probing_sales_pitch' },
  usp_given: { category: 'USP Not Given', field: 'usp_given' },
  substitute_informed: { category: 'Substitute Not Informed', field: 'substitute_informed' },
  lab_info_shared: { category: 'Lab Info Not Shared', field: 'lab_info_shared' },
  followup_date_provided: { category: 'Follow-up Date Not Provided', field: 'followup_date_provided' },
  tone_confidence: { category: 'Tone / Confidence Issue', field: 'tone_confidence' },
  compliance_process: { category: 'Compliance / Process Issue', field: 'compliance_process' }
};

const REMARKS_KEYWORD_MAP = [
  { keywords: ['no proper greeting', 'no greeting', 'greeting missing', 'improper greeting', 'did not greet'], category: 'Greeting / Introduction' },
  { keywords: ['did not understand concern', 'concern not understood', 'concern not clear', 'did not listen', 'did not ask'], category: 'Customer Concern Issue' },
  { keywords: ['random pitch', 'improper pitch', 'no probing', 'did not probe', 'poor pitch', 'pitch not proper'], category: 'Sales Pitch Issue' },
  { keywords: ['usp not given', 'usp missing', 'did not explain usp', 'no usp'], category: 'USP Not Given' },
  { keywords: ['substitute not informed', 'substitute missing', 'no substitute', 'did not inform substitute'], category: 'Substitute Not Informed' },
  { keywords: ['lab info not shared', 'lab info missing', 'no lab info', 'lab not shared', 'did not share lab'], category: 'Lab Info Not Shared' },
  { keywords: ['follow up not given', 'follow-up not given', 'followup not given', 'no follow up date', 'follow up date not given', 'follow up missing'], category: 'Follow-up Date Not Provided' },
  { keywords: ['low confidence', 'casual tone', 'rude', 'tone issue', 'tone not proper', 'confidence issue', 'unprofessional'], category: 'Tone / Confidence Issue' },
  { keywords: ['compliance', 'process not followed', 'process issue', 'non-compliance'], category: 'Compliance / Process Issue' }
];

function isNegativeValue(value) {
  if (value === null || value === undefined) return { isNeg: false, isBlank: true };
  const str = String(value).trim().toLowerCase();
  if (['', 'na', 'n/a', 'not applicable', 'null', '-'].includes(str)) {
    return { isNeg: false, isBlank: true };
  }
  const negatives = [
    'no', 'not done', 'not shared', 'not informed', 'missing', 'poor',
    'incorrect', 'not proper', 'not provided', 'not mentioned', 'need improvement',
    '0', 'false'
  ];
  if (negatives.includes(str)) return { isNeg: true, isBlank: false };
  // Numeric: 0 = missing, 1+ = present
  const num = Number(value);
  if (!isNaN(num)) {
    return { isNeg: num === 0, isBlank: false };
  }
  return { isNeg: false, isBlank: false };
}

function analyzeRemarks(remarks, negativeKeywords) {
  if (!remarks || typeof remarks !== 'string') return [];
  const lowerRemarks = remarks.toLowerCase();
  const found = [];

  for (const mapping of REMARKS_KEYWORD_MAP) {
    for (const kw of mapping.keywords) {
      if (lowerRemarks.includes(kw)) {
        found.push({ category: mapping.category, keyword: kw });
        break;
      }
    }
  }

  // Also check configurable negative keywords for generic mentions
  if (negativeKeywords && negativeKeywords.length) {
    for (const kw of negativeKeywords) {
      if (kw.length > 3 && lowerRemarks.includes(kw.toLowerCase())) {
        // Only add if not already found in specific mapping
        const alreadyFound = found.some(f =>
          lowerRemarks.includes(kw.toLowerCase())
        );
      }
    }
  }

  return found;
}

async function getConfig() {
  try {
    const [rows] = await sequelize.query(
      "SELECT config_key, config_value_json FROM dbo.qa_report_config WHERE config_key IN ('negative_keywords', 'blank_na_keywords')"
    );
    const config = {};
    for (const row of rows) {
      config[row.config_key] = JSON.parse(row.config_value_json || '[]');
    }
    return {
      negativeKeywords: config.negative_keywords || [
        'no', 'not done', 'not shared', 'not informed', 'missing', 'poor',
        'incorrect', 'not proper', 'not provided', 'not mentioned', 'need improvement'
      ],
      blankKeywords: config.blank_na_keywords || ['', 'na', 'n/a', 'not applicable', 'null', '-']
    };
  } catch {
    return {
      negativeKeywords: [
        'no', 'not done', 'not shared', 'not informed', 'missing', 'poor',
        'incorrect', 'not proper', 'not provided', 'not mentioned', 'need improvement'
      ],
      blankKeywords: ['', 'na', 'n/a', 'not applicable', 'null', '-']
    };
  }
}

function analyzeAuditRow(row, config) {
  const missingPoints = [];
  let blankCount = 0;

  // Check each structured field
  for (const [field, info] of Object.entries(CATEGORY_MAP)) {
    const value = row[field];
    const { isNeg, isBlank } = isNegativeValue(value);

    if (isNeg) {
      const alreadyFlagged = missingPoints.some(mp => mp.category === info.category);
      if (!alreadyFlagged) {
        missingPoints.push({
          category: info.category,
          is_missing: true,
          source_field: field,
          source_value: String(value || ''),
          severity: 'high'
        });
      }
    }
    if (isBlank) blankCount++;
  }

  // Analyze remarks
  const remarksFindings = analyzeRemarks(row.remarks, config.negativeKeywords);
  for (const finding of remarksFindings) {
    const alreadyFlagged = missingPoints.some(mp => mp.category === finding.category);
    if (!alreadyFlagged) {
      missingPoints.push({
        category: finding.category,
        is_missing: true,
        source_field: 'remarks',
        source_value: finding.keyword,
        severity: 'medium'
      });
    }
  }

  return { missingPoints, blankCount };
}

module.exports = { analyzeAuditRow, getConfig, CATEGORY_MAP, REMARKS_KEYWORD_MAP, isNegativeValue };
