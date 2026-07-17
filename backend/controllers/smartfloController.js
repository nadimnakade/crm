const axios = require('axios');
const { Op } = require('sequelize');
const { User, Role } = require('../models');

const SMARTFLO_BASE_URL = 'https://api-smartflo.tatateleservices.com/v1';
const SMARTFLO_MAX_PAGES = 25;
const SMARTFLO_PAGE_LIMIT = 100;

function getCurrentISTYMD() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatSmartfloDateBoundary(dateStr, endOfDay = false) {
  const date = String(dateStr || '').trim() || getCurrentISTYMD();
  return `${date} ${endOfDay ? '23:59:59' : '00:00:00'}`;
}

function getSmartfloToken(userRow) {
  return String(process.env.SMARTFLO_API_TOKEN || userRow?.token || '').trim();
}

function getSmartfloHeaders(token) {
  return {
    accept: 'application/json',
    Authorization: `Bearer ${token}`
  };
}

async function getManagedAgentIds(managerId) {
  const team = await User.findAll({
    where: {
      managerId,
      isActive: true
    },
    attributes: ['id']
  });
  return team.map((row) => Number(row.id)).filter((id) => Number.isInteger(id));
}

async function getVisibilityForRecordings(user) {
  const userWithRole = await User.findByPk(user.id, {
    attributes: ['id', 'roleId'],
    include: [{ model: Role, attributes: ['id', 'name'] }]
  });

  const roleName = normalizeText(userWithRole?.Role?.name);
  const roleId = Number(userWithRole?.Role?.id || userWithRole?.roleId || user?.roleId);

  if (
    ['superadmin', 'super admin', 'admin'].includes(roleName) ||
    [1, 2].includes(roleId)
  ) {
    return { scope: 'admin', allowedAgentIds: null };
  }

  if (['manager', 'team leader', 'teamleader', 'team_leader'].includes(roleName) || roleId === 3) {
    const teamIds = await getManagedAgentIds(user.id);
    return { scope: 'manager', allowedAgentIds: Array.from(new Set([user.id, ...teamIds])) };
  }

  return { scope: 'agent', allowedAgentIds: [user.id] };
}

function buildUserMatchers(user) {
  const rawValues = [
    `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
    user?.firstName,
    user?.lastName,
    user?.username,
    (user?.email || '').split('@')[0],
    user?.phone,
    digitsOnly(user?.phone)
  ];

  return Array.from(
    new Set(
      rawValues
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .map((value) => normalizeText(value))
    )
  );
}

function recordMatchesUser(record, userMatchers) {
  const agentName = normalizeText(record?.agent_name);
  const agentNumberRaw = normalizeText(record?.agent_number_with_prefix || record?.agent_number);
  const agentDigits = digitsOnly(record?.agent_number_with_prefix || record?.agent_number);

  return userMatchers.some((matcher) => {
    if (!matcher) return false;

    if (/^\d+$/.test(matcher)) {
      const candidate = matcher.length > 10 ? matcher.slice(-10) : matcher;
      return !!candidate && (
        agentDigits.endsWith(candidate) ||
        agentDigits.includes(candidate)
      );
    }

    return (
      agentName === matcher ||
      agentName.includes(matcher) ||
      matcher.includes(agentName) ||
      agentNumberRaw.includes(matcher)
    );
  });
}

function getRecordDateTime(record) {
  const endStamp = String(record?.end_stamp || '').trim();
  if (endStamp) return endStamp;
  const date = String(record?.date || '').trim();
  const time = String(record?.time || '').trim();
  return [date, time].filter(Boolean).join(' ').trim();
}

function compareValues(a, b, order) {
  const factor = order === 'asc' ? 1 : -1;
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1 * factor;
  if (b === null || b === undefined || b === '') return -1 * factor;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * factor;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * factor;
}

function mapRecordingRow(record) {
  return {
    id: record.call_id || record.id || record.uuid,
    callId: record.call_id || null,
    uuid: record.uuid || null,
    callDateTime: getRecordDateTime(record),
    sortDateTime: new Date(getRecordDateTime(record) || 0).getTime() || 0,
    agentName: record.agent_name || '',
    agentNumber: record.agent_number_with_prefix || record.agent_number || '',
    customerNumber: record.client_number || record.caller_id_num || '',
    duration: Number(record.call_duration || 0),
    status: record.status || record.description || '',
    callType: record.direction || '',
    recordingUrl: record.recording_url || '',
    reason: record.reason || '',
    raw: record
  };
}

function applyRecordingFilters(records, filters) {
  const search = normalizeText(filters.search);
  const callerDigits = digitsOnly(filters.callerNumber);
  const direction = normalizeText(filters.direction);
  const status = normalizeText(filters.status);

  return records.filter((record) => {
    if (filters.userMatcherSets?.length) {
      const matchesAllowedUser = filters.userMatcherSets.some((matchers) => recordMatchesUser(record, matchers));
      if (!matchesAllowedUser) return false;
    }

    if (direction && normalizeText(record.direction) !== direction) return false;
    if (status && normalizeText(record.status) !== status) return false;

    if (callerDigits) {
      const recordCallerDigits = digitsOnly(record.client_number || record.caller_id_num);
      if (!recordCallerDigits.includes(callerDigits)) return false;
    }

    if (search) {
      const searchable = [
        record.call_id,
        record.uuid,
        record.agent_name,
        record.agent_number,
        record.agent_number_with_prefix,
        record.client_number,
        record.status,
        record.description,
        record.reason,
        record.direction
      ]
        .map((value) => normalizeText(value))
        .join(' ');

      if (!searchable.includes(search)) return false;
    }

    return true;
  });
}

function sortRecordingRows(rows, sortBy, sortOrder) {
  const order = normalizeText(sortOrder) === 'asc' ? 'asc' : 'desc';
  const field = normalizeText(sortBy) || 'calldatetime';

  const selectors = {
    calldatetime: (row) => row.sortDateTime,
    agentname: (row) => normalizeText(row.agentName),
    customernumber: (row) => digitsOnly(row.customerNumber),
    duration: (row) => Number(row.duration || 0),
    status: (row) => normalizeText(row.status),
    calltype: (row) => normalizeText(row.callType)
  };

  const selector = selectors[field] || selectors.calldatetime;
  return [...rows].sort((a, b) => compareValues(selector(a), selector(b), order));
}

async function fetchSmartfloCallRecords(token, params) {
  const allRecords = [];
  let providerCount = 0;
  let page = 1;

  while (page <= SMARTFLO_MAX_PAGES) {
    const response = await axios.get(`${SMARTFLO_BASE_URL}/call/records`, {
      headers: getSmartfloHeaders(token),
      params: {
        from_date: params.fromDateTime,
        to_date: params.toDateTime,
        page,
        limit: SMARTFLO_PAGE_LIMIT,
        ...(params.direction ? { direction: params.direction } : {}),
        ...(params.callerid ? { callerid: params.callerid } : {})
      },
      timeout: 30000
    });

    const payload = response.data || {};
    const results = Array.isArray(payload.results) ? payload.results : [];
    providerCount = Math.max(providerCount, Number(payload.count || 0));
    allRecords.push(...results);

    if (!results.length || results.length < SMARTFLO_PAGE_LIMIT) break;
    if (providerCount && allRecords.length >= providerCount) break;
    page += 1;
  }

  return { records: allRecords, providerCount };
}

// @desc    Initiate a click-to-call request via Smartflo API
// @route   POST /api/click-to-call
// @access  Private
exports.initiateCall = async (req, res) => {
  try {
    const { from, to } = req.body;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Both "from" (agent) and "to" (customer) numbers are required.'
      });
    }

    // Phone formatter
    const validatePhone = (num) => {
      if (!num) return null;

      let clean = num.toString().replace(/\D/g, "");

      if (clean.length === 10) {
        clean = "91" + clean;
      }

      if (clean.length === 12 && clean.startsWith("91")) {
        return clean;
      }

      return null;
    };

    const cleanFrom = validatePhone(from);
    const cleanTo = validatePhone(to);

    if (!cleanFrom) {
      return res.status(400).json({
        success: false,
        message: "Invalid agent number format"
      });
    }

    if (!cleanTo) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer number format"
      });
    }

    const userRow = await User.findByPk(req.user.id, { attributes: ['id', 'token', 'phone'] });
    const userToken = String(userRow?.token || '').trim();
    const apiKey = userToken;

    if (!apiKey) {
      console.error("Smartflo API key missing (user.token and SMARTFLO_API_TOKEN both empty)");
      return res.status(500).json({
        success: false,
        message: "Smartflo API key not configured"
      });
    } 

    

    const callerId =  validatePhone(userRow?.phone) || cleanFrom;

    const payload1 = {
      "async": 1,        
      "customer_number": cleanTo.length === 12 && cleanTo.startsWith("91") ? cleanTo.substring(2) : cleanTo, // Match Postman: 10 digits
      "customer_ring_timeout": 30,
      "caller_id": callerId,          // Match Postman: 12 digits
      "api_key": apiKey
    };
    console.log("Payload:", { ...payload1, api_key: '[redacted]' });
    const response = await axios.post(
      `${SMARTFLO_BASE_URL}/click_to_call_support`,
      payload1,
      {
        headers: {
          "accept": "application/json",
          "Content-Type": "application/json"
          // NO Authorization header needed
        },
        timeout: 15000
      }
    );

    
    console.log("========== SMARTFLO RESPONSE ==========");
    console.log(response.data);

    return res.status(200).json({
      success: true,
      message: "Call initiated successfully",
      data: response.data
    });

  } catch (error) {

    console.error("========== SMARTFLO ERROR ==========");

    if (error.response) {
      console.error(error.response.status);
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }

    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Click-to-Call failed",
      error: error.response?.data || error.message
    });
  }
};

// @desc    Get Smartflo call recordings with backend role filtering
// @route   GET /api/smartflo/call-recordings
// @access  Private
exports.getCallRecordings = async (req, res) => {
  try {
    const userRow = await User.findByPk(req.user.id, {
      attributes: ['id', 'token', 'roleId', 'firstName', 'lastName', 'username', 'email', 'phone']
    });

    const token = getSmartfloToken(userRow);
    if (!token) {
      return res.status(500).json({
        success: false,
        message: 'Smartflo API token not configured'
      });
    }

    const visibility = await getVisibilityForRecordings(req.user);
    const requestedAgentId = req.query.agentId ? parseInt(req.query.agentId, 10) : null;

    if (
      requestedAgentId &&
      visibility.allowedAgentIds &&
      !visibility.allowedAgentIds.includes(requestedAgentId)
    ) {
      return res.status(403).json({ message: 'You are not allowed to view recordings for this agent' });
    }

    const visibleUsersWhere = visibility.allowedAgentIds
      ? { id: { [Op.in]: visibility.allowedAgentIds }, isActive: true }
      : { isActive: true };

    let visibleUsers = await User.findAll({
      where: visibleUsersWhere,
      attributes: ['id', 'firstName', 'lastName', 'username', 'email', 'phone'],
      order: [['firstName', 'ASC'], ['lastName', 'ASC']]
    });

    if (requestedAgentId) {
      visibleUsers = visibleUsers.filter((user) => Number(user.id) === requestedAgentId);
    }

    const fromDate = String(req.query.fromDate || req.query.from || '').trim() || getCurrentISTYMD();
    const toDate = String(req.query.toDate || req.query.to || '').trim() || fromDate;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const sortBy = String(req.query.sortBy || 'callDateTime').trim();
    const sortOrder = String(req.query.sortOrder || 'desc').trim();
    const direction = normalizeText(req.query.callType || req.query.direction);
    const status = String(req.query.callStatus || req.query.status || '').trim();
    const callerNumber = String(req.query.callerNumber || '').trim();
    const search = String(req.query.search || '').trim();

    const { records, providerCount } = await fetchSmartfloCallRecords(token, {
      fromDateTime: formatSmartfloDateBoundary(fromDate, false),
      toDateTime: formatSmartfloDateBoundary(toDate, true),
      direction,
      callerid: digitsOnly(callerNumber)
    });

    const filteredRecords = applyRecordingFilters(records, {
      userMatcherSets: visibleUsers.map((user) => buildUserMatchers(user)),
      direction,
      status,
      callerNumber,
      search
    });

    const mappedRows = filteredRecords.map(mapRecordingRow);
    const sortedRows = sortRecordingRows(mappedRows, sortBy, sortOrder);
    const total = sortedRows.length;
    const offset = (page - 1) * pageSize;
    const pagedRows = sortedRows.slice(offset, offset + pageSize);

    res.json({
      success: true,
      data: pagedRows,
      total,
      page,
      pageSize,
      providerCount,
      filters: {
        agents: visibleUsers.map((user) => ({
          id: user.id,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.email
        }))
      }
    });
  } catch (error) {
    console.error('Smartflo call recordings fetch failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to fetch Smartflo call recordings',
      error: error.response?.data || error.message
    });
  }
};

// @desc    Webhook for Smartflo call status events
// @route   POST /api/smartflo-webhook
// @access  Public (or protected by signature if supported)
exports.handleWebhook = async (req, res) => {
  try {
    const eventData = req.body;

    // Log the event
    console.log('Smartflo Webhook Event:', JSON.stringify(eventData, null, 2));

    // Here you would typically update the call status in your database
    // e.g., finding the call record by ID and updating status to 'connected', 'completed', etc.

    res.status(200).json({ message: 'Webhook received successfully' });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ message: 'Error processing webhook' });
  }
};
