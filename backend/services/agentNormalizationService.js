const { sequelize } = require('../config/db');

const INVALID_NAME_PATTERNS = [
  /^\d+$/,                       // Any purely numeric string (phone, IDs, etc.)
  /^\+?\d{10,}$/,               // International phone numbers
  /^[\w.-]+@[\w.-]+\.\w+$/,     // Email addresses
  /^test/i,                      // Test entries
  /^demo/i,                      // Demo entries
  /^unknown$/i,                  // Unknown
  /^null$/i,                     // Null string
  /^undefined$/i                 // Undefined string
];

const TRAILING_HYPHEN_PATTERN = /[-_]+$/;
const MULTI_SPACE_PATTERN = /\s{2,}/g;

function cleanAgentName(rawName) {
  if (!rawName || typeof rawName !== 'string') return { clean: '', isInvalid: true, reason: 'empty' };

  let cleaned = rawName.trim();
  cleaned = cleaned.replace(TRAILING_HYPHEN_PATTERN, '');
  cleaned = cleaned.replace(MULTI_SPACE_PATTERN, ' ');
  cleaned = cleaned.trim();

  if (!cleaned) return { clean: '', isInvalid: true, reason: 'empty' };

  for (const pattern of INVALID_NAME_PATTERNS) {
    if (pattern.test(cleaned)) {
      return {
        clean: cleaned,
        isInvalid: true,
        reason: 'Data Issue - Invalid agent name'
      };
    }
  }

  // Title case normalization
  const normalized = cleaned
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return { clean: normalized, isInvalid: false, reason: null };
}

async function getAliases() {
  try {
    const [rows] = await sequelize.query(
      'SELECT raw_agent_name, clean_agent_name, mapped_agent_name FROM dbo.qa_agent_aliases'
    );
    return rows || [];
  } catch {
    return [];
  }
}

function applyAlias(cleanName, aliases) {
  if (!cleanName || !aliases.length) return cleanName;
  const alias = aliases.find(
    a => a.clean_agent_name.toLowerCase() === cleanName.toLowerCase()
  );
  return alias ? alias.mapped_agent_name : cleanName;
}

async function normalizeBatch(rawNames) {
  const aliases = await getAliases();
  return rawNames.map(raw => {
    const { clean, isInvalid, reason } = cleanAgentName(raw);
    const mapped = applyAlias(clean, aliases);
    return { raw, clean: mapped, isInvalid, reason };
  });
}

module.exports = { cleanAgentName, getAliases, applyAlias, normalizeBatch, INVALID_NAME_PATTERNS };
