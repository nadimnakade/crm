const models = require('../models');
const { Call, Customer, User, Role, sequelize } = models;
const CallAssignment = models.CallAssignment || require('../models/CallAssignment');
const { Op, QueryTypes } = require('sequelize');
const xlsx = require('xlsx');
const path = require('path');

const hasOrdersViewerAccess = async (user) => {
  if (!user) return false;
  try {
    const role = await Role.findByPk(user.roleId);
    const name = role ? (role.name || '').toLowerCase() : '';
    return name === 'orders viewer' || name === 'orders_viewer' || name === 'ordersviewer' || name === 'admin' || name === 'super admin' || name === 'superadmin';
  } catch { return false; }
};

// Helper: determine if follow-up date is required based on type/category/outcome
function requiresFollowUpDate(callType, category, outcome) {
  const t = (callType || '').toString().trim().toLowerCase();
  const c = (category || '').toString().trim().toLowerCase();
  const o = (outcome || '').toString().trim().toLowerCase();
  const mentionsFollowUp = o.includes('follow'); // matches 'follow up', 'follow-up scheduled', 'followup'
  const salesCallCategories = new Set(['sales-call', 'sales call', 'sales_call']);
  const newOrderRelatedCategories = new Set(['new order related', 'new-order-related', 'new_order_related']);
  const case1 = t === 'outbound' && salesCallCategories.has(c) && mentionsFollowUp;
  const case2 = t === 'inbound' && newOrderRelatedCategories.has(c) && mentionsFollowUp;
  return case1 || case2;
}

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

function getISTDayRangeUtc(dateStr) {
  const [year, month, day] = String(dateStr || '').split('-').map((value) => parseInt(value, 10));
  const istOffsetMinutes = 330;
  const startUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - (istOffsetMinutes * 60 * 1000);
  const endUtcMs = Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0) - (istOffsetMinutes * 60 * 1000);
  return {
    startUtc: new Date(startUtcMs),
    endUtcExclusive: new Date(endUtcMs)
  };
}

const FOLLOWUP_UPLOAD_TYPES = ['follow-up upload', 'followup upload', 'followups upload'];
const IMPORTANT_CALL_UPLOAD_TYPE = 'Imp Call Upload';
const IMPORTANT_CALL_UPLOAD_TYPES = ['Imp Call Upload', 'Imp Calls Upload'];
const ALL_UPLOAD_TYPES = ['Order Upload', ...IMPORTANT_CALL_UPLOAD_TYPES, ...FOLLOWUP_UPLOAD_TYPES];

function normalizeAgentIds(agentIds, fallbackAgentId) {
  const raw = Array.isArray(agentIds)
    ? agentIds
    : (agentIds !== undefined && agentIds !== null ? [agentIds] : []);
  const parsed = raw
    .map((value) => parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (!parsed.length && fallbackAgentId) {
    const fallback = parseInt(fallbackAgentId, 10);
    if (Number.isInteger(fallback) && fallback > 0) parsed.push(fallback);
  }
  return Array.from(new Set(parsed));
}

async function ensureLegacyAssignment(call, actorId, transaction) {
  if (!call?.id || !call?.agentId) return;
  const queryOptions = transaction ? { transaction } : {};
  const existing = await CallAssignment.count({
    where: { CallId: call.id },
    ...queryOptions
  });
  if (existing > 0) return;
  await CallAssignment.create({
    CallId: call.id,
    AgentId: call.agentId,
    AssignedBy: actorId || call.updatedBy || call.createdBy || call.agentId,
    AssignedAt: call.createdAt || new Date(),
    IsResolved: !call.followUpRequired,
    ResolvedBy: call.followUpRequired ? null : (call.resolvedBy || actorId || null),
    ResolvedAt: call.followUpRequired ? null : (call.resolvedAt || new Date())
  }, queryOptions);
}

async function syncCallAssignments(call, agentIds, actorId, transaction) {
  const desiredAgentIds = normalizeAgentIds(agentIds, call?.agentId);
  if (!call?.id || !desiredAgentIds.length) return [];
  const queryOptions = transaction ? { transaction } : {};

  const existing = await CallAssignment.findAll({
    where: { CallId: call.id },
    ...queryOptions
  });
  const existingByAgentId = new Map(existing.map((row) => [Number(row.AgentId), row]));
  const now = new Date();

  for (const agentId of desiredAgentIds) {
    const assignment = existingByAgentId.get(agentId);
    if (assignment) {
      if (assignment.IsResolved) {
        assignment.IsResolved = false;
        assignment.ResolvedBy = null;
        assignment.ResolvedAt = null;
      }
      assignment.AssignedBy = actorId || assignment.AssignedBy;
      assignment.AssignedAt = assignment.AssignedAt || now;
      await assignment.save(queryOptions);
    } else {
      await CallAssignment.create({
        CallId: call.id,
        AgentId: agentId,
        AssignedBy: actorId || call.createdBy || call.agentId,
        AssignedAt: now,
        IsResolved: false
      }, queryOptions);
    }
  }

  const deselectedAgentIds = existing
    .map((row) => Number(row.AgentId))
    .filter((agentId) => !desiredAgentIds.includes(agentId));

  if (deselectedAgentIds.length) {
    await CallAssignment.update(
      {
        IsResolved: true,
        ResolvedBy: actorId || null,
        ResolvedAt: now
      },
      {
        where: {
          CallId: call.id,
          AgentId: { [Op.in]: deselectedAgentIds },
          IsResolved: false
        },
        ...queryOptions
      }
    );
  }

  if (call.agentId !== desiredAgentIds[0]) {
    call.agentId = desiredAgentIds[0];
  }

  return desiredAgentIds;
}

async function resolveAssignmentsForCall(callId, actorId, transaction) {
  const queryOptions = transaction ? { transaction } : {};
  await CallAssignment.update(
    {
      IsResolved: true,
      ResolvedBy: actorId || null,
      ResolvedAt: new Date()
    },
    {
      where: {
        CallId: callId,
        IsResolved: false
      },
      ...queryOptions
    }
  );
}

async function canUserViewCall(call, user) {
  if (!call || !user) return false;
  const visibility = await getVisibility(user);
  if (visibility.scope === 'admin') return true;
  if (visibility.scope === 'manager') {
    return visibility.allowedAgentIds.includes(call.agentId)
      || visibility.allowedAgentIds.includes(call.createdBy)
      || visibility.allowedAgentIds.includes(call.updatedBy);
  }
  return call.createdBy === user.id
    || call.updatedBy === user.id
    || call.agentId === user.id;
}

// @desc    Get calls with server-side pagination and filters
// @route   GET /api/calls
// @access  Private
exports.getCalls = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const searchTerm = (req.query.searchTerm || '').toString().trim();
    const status = (req.query.status || '').toString().trim();
    const type = (req.query.type || '').toString().trim(); // maps to callType
    const customerId = req.query.customerId ? parseInt(req.query.customerId, 10) : null;
    const requestedAgentId = req.query.agentId ? parseInt(req.query.agentId, 10) : null;
    const orderId = (req.query.orderId || '').toString().trim();
    const hasOrderDetails = ['true', '1'].includes((req.query.hasOrderDetails || '').toString().toLowerCase());
    const hasRefundDetails = ['true', '1'].includes((req.query.hasRefundDetails || '').toString().toLowerCase());
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    const sortBy = (req.query.sortBy || 'createdAt').toString();
    const sortOrder = ((req.query.sortOrder || 'DESC').toString().toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

    const where = {};
    if (status) where.outcome = status; // map UI status to outcome
    if (type) {
      where.callType = type;
    } else {
      where.callType = { [Op.notIn]: ALL_UPLOAD_TYPES };
    }
    if (customerId) where.customerId = customerId;
    if (orderId) where.orderId = { [Op.like]: `%${orderId}%` };
    if (hasOrderDetails) where.orderDetails = { [Op.ne]: null };
    if (hasRefundDetails) where.refundDetails = { [Op.ne]: null };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[Op.gte] = startDate;
      if (endDate) where.date[Op.lte] = endDate;
    }

    const visibility = await getVisibility(req.user);
    const visibilityFilters = [];
    if (visibility.scope === 'agent') {
      visibilityFilters.push({
        [Op.or]: [
          { createdBy: req.user.id },
          { updatedBy: req.user.id },
          { agentId: req.user.id }
        ]
      });
    } else if (visibility.scope === 'manager') {
      const visibleAgentIds = requestedAgentId && visibility.allowedAgentIds.includes(requestedAgentId)
        ? [requestedAgentId]
        : visibility.allowedAgentIds;
      visibilityFilters.push({
        [Op.or]: [
          { createdBy: { [Op.in]: visibleAgentIds } },
          { updatedBy: { [Op.in]: visibleAgentIds } },
          { agentId: { [Op.in]: visibleAgentIds } }
        ]
      });
    } else if (visibility.scope === 'admin' && requestedAgentId) {
      visibilityFilters.push({
        [Op.or]: [
          { createdBy: requestedAgentId },
          { updatedBy: requestedAgentId },
          { agentId: requestedAgentId }
        ]
      });
    }

    let customerWhere = undefined;
    const callSearchWhere = [];
    if (searchTerm) {
      // Search across call fields
      callSearchWhere.push(
        { notes: { [Op.like]: `%${searchTerm}%` } },
        { outcome: { [Op.like]: `%${searchTerm}%` } },
        { orderId: { [Op.like]: `%${searchTerm}%` } }
      );
      // Detect potential phone search (digits-only >= 5)
      const digitsOnly = (searchTerm || '').replace(/[^0-9]/g, '');
      const phoneFilter = digitsOnly.length >= 5 ? { phone: { [Op.like]: `%${digitsOnly}%` } } : undefined;
      // Search customer name and optionally phone
      const ors = [
        { firstName: { [Op.like]: `%${searchTerm}%` } },
        { lastName: { [Op.like]: `%${searchTerm}%` } }
      ];
      if (phoneFilter) ors.push(phoneFilter);
      customerWhere = { [Op.or]: ors };
    }

    const offset = (page - 1) * pageSize;
    const allowedSort = ['createdAt', 'date', 'outcome', 'duration'];
    const order = allowedSort.includes(sortBy) ? [[sortBy, sortOrder]] : [['date', 'DESC']];
    const { rows, count } = await Call.findAndCountAll({
      where: searchTerm
        ? { [Op.and]: [where, { [Op.or]: callSearchWhere }, ...visibilityFilters] }
        : (visibilityFilters.length ? { [Op.and]: [where, ...visibilityFilters] } : where),
      include: [
        customerWhere ? { model: Customer, where: customerWhere, required: true } : { model: Customer },
        { model: User, as: 'agent', attributes: ['id', 'firstName', 'lastName'] }
      ],
      attributes: {
        include: ['createdBy', 'updatedBy', 'resolvedBy', 'resolvedAt']
      },
      order,
      limit: pageSize,
      offset
    });

    res.json({ data: rows, total: count, page, pageSize });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Bulk upload follow-ups from Excel/CSV
// @route   POST /api/calls/followups/upload
// @access  Admins only
exports.uploadFollowUps = async (req, res) => {
  try {
    const uploadKind = (req.query.kind || 'followup').toString().trim().toLowerCase();
    const isImportantUpload = uploadKind === 'important';
    const importedCallType = isImportantUpload ? IMPORTANT_CALL_UPLOAD_TYPE : 'Follow-up Upload';
    const importLabel = isImportantUpload ? 'Important Calls' : 'Follow-ups';
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    const wb = xlsx.readFile(file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    if (!rows || rows.length < 2) {
      return res.status(422).json({ message: 'No data rows found' });
    }

    const header = rows[0].map(h => String(h || '').trim().toLowerCase());
    const idx = (name) => header.indexOf(name.toLowerCase());
    const colFollow = idx('follow up') !== -1 ? idx('follow up') : idx('followup');
    const colOrderId = idx('order id');
    const colName = idx('name');
    const colNumber = idx('number');
    const colType = idx('type');
    const colAgent = idx('agent');

    const requiredMissing = [colFollow, colName, colNumber].some(i => i === -1);
    if (requiredMissing) {
      const missing = [];
      if (colFollow === -1) missing.push('Follow up');
      if (colName === -1) missing.push('Name');
      if (colNumber === -1) missing.push('Number');
      return res.status(422).json({ message: `Missing required headers: ${missing.join(', ')}. Expected: Follow up, Name, Number, [Order ID], [Type], [Agent]` });
    }

    const results = { inserted: 0, skipped: 0, errors: [], warnings: [] };
    const seenKeys = new Set();

    for (let r = 1; r < rows.length; r++) {
      try {
        const row = rows[r];
        const fuRaw = row[colFollow];
        const nameRaw = String(row[colName] || '').trim();
        const numberRaw = String(row[colNumber] || '').trim().replace(/[^0-9]/g, '');
        const typeRaw = colType !== -1 ? String(row[colType] || '').trim() : '';
        const agentName = colAgent !== -1 ? String(row[colAgent] || '').trim() : '';
        const orderIdRaw = colOrderId !== -1 ? String(row[colOrderId] || '').trim() : '';

        if (!nameRaw || !numberRaw || numberRaw.length < 10) {
          results.skipped++;
          const reason = !nameRaw ? 'Missing name' : (!numberRaw ? 'Missing phone number' : `Phone too short (${numberRaw.length} digits, need 10)`);
          results.errors.push({ row: r + 1, message: reason, name: nameRaw, phone: numberRaw || '' });
          continue;
        }

        let followDateStr = '';
        if (fuRaw) {
          const s = String(fuRaw).trim();
          if (s) {
            const m1 = /^(\d{1,2})[-\/ ]([A-Za-z]{3})[-\/ ]?(\d{2,4})?$/.exec(s);
            if (m1) {
              const day = parseInt(m1[1], 10) || 1;
              const monStr = m1[2].toLowerCase();
              const monMap = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
              const mi = monMap.indexOf(monStr);
              let year = new Date().getFullYear();
              if (m1[3]) {
                const yNum = parseInt(m1[3], 10);
                if (!isNaN(yNum)) {
                  year = yNum < 100 ? 2000 + yNum : yNum;
                }
              }
              const mm = String((mi === -1 ? 0 : mi) + 1).padStart(2, '0');
              const dd = String(day).padStart(2, '0');
              followDateStr = `${year}-${mm}-${dd}`;
            } else {
              const tryDate = new Date(s);
              if (!isNaN(tryDate.getTime())) {
                const y = tryDate.getFullYear();
                const m = tryDate.getMonth();
                const d = tryDate.getDate();
                const mm = String(m + 1).padStart(2, '0');
                const dd = String(d).padStart(2, '0');
                followDateStr = `${y}-${mm}-${dd}`;
              }
            }
          }
        }

        // Find or create customer by phone
        const phone10 = numberRaw.slice(-10);
        let customer = await Customer.findOne({ where: { phone: { [Op.like]: `%${phone10}` } } });
        if (!customer) {
          const parts = nameRaw.split(' ');
          customer = await Customer.create({
            phone: numberRaw,
            firstName: parts[0] || 'Unknown',
            lastName: parts.slice(1).join(' ') || '.',
            status: 'Active'
          });
        }

        const duplicateKey = `${phone10}|${orderIdRaw || ''}|${followDateStr}`;
        if (seenKeys.has(duplicateKey)) {
          results.skipped++;
          results.errors.push({ row: r + 1, message: `Duplicate: same phone/order/date already in this file`, name: nameRaw, phone: numberRaw });
          continue;
        }

        // We only dedupe within the current file using seenKeys.
        // Existing records in the database are allowed; frontend list will show unique rows.

        seenKeys.add(duplicateKey);

        // Find agent
        let assignedAgentId = req.user.id;
        if (agentName) {
          const trimmedAgent = agentName.trim();
          const lowered = trimmedAgent.toLowerCase();
          const orConditions = [
            sequelize.where(
              sequelize.fn(
                'LOWER',
                sequelize.fn('concat', sequelize.col('firstName'), ' ', sequelize.col('lastName'))
              ),
              { [Op.like]: `%${lowered}%` }
            ),
            sequelize.where(
              sequelize.fn('LOWER', sequelize.col('username')),
              { [Op.like]: `%${lowered}%` }
            ),
            sequelize.where(
              sequelize.fn('LOWER', sequelize.col('email')),
              { [Op.like]: `%${lowered}%` }
            )
          ];
          const asNumber = parseInt(trimmedAgent, 10);
          if (!isNaN(asNumber)) {
            orConditions.push({ id: asNumber });
          }

          const agentUser = await User.findOne({
            where: { [Op.or]: orConditions }
          });
          if (agentUser) assignedAgentId = agentUser.id;
        }

        // Treat 'Fresh' style order IDs as blank
        const orderId = /fresh/i.test(orderIdRaw) ? null : (orderIdRaw || null);

        await Call.create({
          customerId: customer.id,
          agentId: assignedAgentId,
          orderId: orderId,
          date: new Date(),
          callType: importedCallType,
          category: typeRaw || 'Follow-up',
          outcome: 'Follow-up',
          notes: `Imported via ${importLabel} upload. Type: ${typeRaw}. Agent: ${agentName}. File: ${path.basename(file.path)}`,
          followUpRequired: true,
          followUpDate: followDateStr || null
        });

        if (!followDateStr) {
          results.warnings.push({ row: r + 1, message: 'Follow-up date not recognized — record created but may not appear in date-filtered views', name: nameRaw, phone: numberRaw, rawDate: String(fuRaw || '').trim() });
        }
        results.inserted++;
      } catch (e) {
        results.skipped++;
        results.errors.push({ row: r + 1, message: e.message || 'Row failed', name: nameRaw, phone: numberRaw });
      }
    }

    const errorSummary = {};
    for (const e of results.errors) {
      const key = e.message.split(':')[0].trim();
      errorSummary[key] = (errorSummary[key] || 0) + 1;
    }
    results.errorSummary = errorSummary;
    results.totalRows = rows.length - 1;

    res.status(results.inserted > 0 ? 201 : 422).json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

exports.uploadImportantCalls = async (req, res) => {
  req.query = { ...(req.query || {}), kind: 'important' };
  return exports.uploadFollowUps(req, res);
};

// @desc    List follow-ups created via file upload
// @route   GET /api/calls/followups/uploaded
// @access  Private (role-based visibility)
exports.getUploadedFollowUps = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const offset = (page - 1) * pageSize;
    const isExport = (req.query.export || '').toString().toLowerCase() === 'true';
    const visibility = await getVisibility(req.user);
    const rawSearch = (req.query.search || '').toString().trim();
    const hasSearch = rawSearch.length > 0;

    const fromStr = (req.query.from || '').toString().trim();
    const toStr = (req.query.to || '').toString().trim();
    const todayYmd = getCurrentISTYMD();
    const fromDate = fromStr || todayYmd;
    const toDate = toStr || fromStr || todayYmd;

    const digitsOnly = rawSearch.replace(/[^0-9]/g, '');
    const searchLike = `%${rawSearch}%`;
    const searchLowerLike = `%${rawSearch.toLowerCase()}%`;
    const digitsLike = digitsOnly.length >= 3 ? `%${digitsOnly}%` : null;

    const agentScopeSql =
      visibility.scope === 'agent'
        ? 'AND c.agentId = :agentId'
        : (visibility.scope === 'manager' ? 'AND c.agentId IN (:allowedAgentIds)' : '');

    const searchSql = hasSearch
      ? `
        AND (          
          c.orderId LIKE :searchLike OR
          c.category LIKE :searchLike OR
          c.notes LIKE :searchLike OR
          c.outcome LIKE :searchLike OR
          LOWER(cu.firstName) LIKE :searchLowerLike OR
          LOWER(cu.lastName) LIKE :searchLowerLike
          ${digitsLike ? 'OR cu.phone LIKE :digitsLike' : ''}
        )
      `
      : '';

    const baseCte = `
      WITH Filtered AS (
        SELECT
          c.id,
          c.customerId,
          c.agentId,
          c.orderId,
          c.callType,
          c.category,
          c.outcome,
          c.reason,
          c.followUpRequired,
          c.followUpDate,
          c.createdAt,
          c.updatedAt,
          CASE WHEN c.orderId IS NOT NULL OR c.orderDetails IS NOT NULL THEN 1 ELSE 0 END AS hasOrder,
          cu.firstName AS customerFirstName,
          cu.lastName AS customerLastName,
          cu.phone AS customerPhone,
          CASE
            WHEN cu.PhoneDigits IS NOT NULL AND LTRIM(RTRIM(cu.PhoneDigits)) <> '' THEN RIGHT(cu.PhoneDigits, 10)
            WHEN cu.phone IS NULL OR LTRIM(RTRIM(cu.phone)) = '' THEN CONCAT('cust:', c.customerId)
            ELSE RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cu.phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), 10)
          END AS phoneKey,
          u.firstName AS agentFirstName,
          u.lastName AS agentLastName
        FROM dbo.Calls c WITH (NOLOCK)
        LEFT JOIN dbo.Customers cu WITH (NOLOCK) ON cu.id = c.customerId
        LEFT JOIN dbo.Users u WITH (NOLOCK) ON u.id = c.agentId
        WHERE CONVERT(date, DATEADD(MINUTE, 330, c.followUpDate)) >= CONVERT(date, :fromDate)
          AND CONVERT(date, DATEADD(MINUTE, 330, c.followUpDate)) <= CONVERT(date, :toDate)
          AND c.followUpRequired = 1
          AND c.outcome NOT IN ('Lead', 'Order', 'Order Already Placed', 'Reorder')
          AND LOWER(c.callType) NOT IN ('order upload', 'imp call upload', 'imp calls upload')
          ${agentScopeSql}
          ${searchSql}
      ),
      Ranked AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY phoneKey
            ORDER BY updatedAt DESC, createdAt DESC, id DESC
          ) AS rn
        FROM Filtered
      )
    `;

    const replacements = {
      fromDate,
      toDate,
      offset,
      pageSize,
      searchLike,
      searchLowerLike,
      digitsLike,
      agentId: req.user.id,
      allowedAgentIds: visibility.allowedAgentIds && visibility.allowedAgentIds.length ? visibility.allowedAgentIds : [0]
    };

    if (isExport) {
      const rows = await sequelize.query(
        `
          ${baseCte}
          SELECT *
          FROM Ranked
          WHERE rn = 1
          ORDER BY CAST(DATEADD(MINUTE, 330, followUpDate) AS DATE) ASC, followUpDate ASC, updatedAt DESC
        `,
        { type: QueryTypes.SELECT, raw: true, replacements }
      );
      const exportRows = (rows || []).map(r => {
        const callTypeLower = (r.callType || '').toString().toLowerCase();
        let type = r.category;
        if (callTypeLower !== 'follow-up upload' && !!r.followUpRequired) {
          type = r.hasOrder ? 'Order Followup' : 'Fresh Followup';
        }

        return {
          'Follow up': r.followUpDate ? new Date(r.followUpDate).toLocaleDateString() : '',
          'Name': `${r.customerFirstName || ''} ${r.customerLastName || ''}`.trim(),
          'Number': r.customerPhone || '',
          'Order ID': r.orderId || '',
          'Type': type || '',
          'Status': r.outcome || '',
          'Reason': r.reason || '',
          'Agent': `${r.agentFirstName || ''} ${r.agentLastName || ''}`.trim()
        };
      });

      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(exportRows);
      xlsx.utils.book_append_sheet(wb, ws, 'Uploaded Followups');
      const b64 = xlsx.write(wb, { type: 'base64', bookType: 'xlsx' });
      const buf = Buffer.from(b64, 'base64');

      res.setHeader('Content-Disposition', 'attachment; filename="UploadedFollowups.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Length', String(buf.length));
      res.setHeader('Cache-Control', 'no-store');
      return res.end(buf);
    }

    const countRows = await sequelize.query(
      `
        ${baseCte}
        SELECT COUNT(*) AS total
        FROM Ranked
        WHERE rn = 1
      `,
      { type: QueryTypes.SELECT, raw: true, replacements }
    );
    const total = Number(countRows?.[0]?.total || 0);

    const rows = await sequelize.query(
      `
        ${baseCte}
        SELECT *
        FROM Ranked
        WHERE rn = 1
        ORDER BY CAST(DATEADD(MINUTE, 330, followUpDate) AS DATE) ASC, followUpDate ASC, updatedAt DESC
        OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY
      `,
      { type: QueryTypes.SELECT, raw: true, replacements }
    );

    const data = (rows || []).map(r => {
      const callTypeLower = (r.callType || '').toString().toLowerCase();
      let type = r.category;
      if (callTypeLower !== 'follow-up upload' && !!r.followUpRequired) {
        type = r.hasOrder ? 'Order Followup' : 'Fresh Followup';
      }

      return {
        id: r.id,
        customerId: r.customerId,
        followUpDate: r.followUpDate,
        name: `${r.customerFirstName || ''} ${r.customerLastName || ''}`.trim(),
        number: r.customerPhone || '',
        orderId: r.orderId,
        type,
        outcome: r.outcome,
        reason: r.reason,
        agent: `${r.agentFirstName || ''} ${r.agentLastName || ''}`.trim()
      };
    });

    res.json({ data, total, page, pageSize });
  } catch (error) {
    console.error('getUploadedFollowUps failed:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

exports.getUploadedOrderFollowUps = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const offset = (page - 1) * pageSize;
    const isExport = (req.query.export || '').toString().toLowerCase() === 'true';
    const visibility = await getVisibility(req.user);
    const rawSearch = (req.query.search || '').toString().trim();
    const hasSearch = rawSearch.length > 0;

    const fromStr = (req.query.from || '').toString().trim();
    const toStr = (req.query.to || '').toString().trim();
    const todayYmd = getCurrentISTYMD();
    const fromDate = fromStr || todayYmd;
    const toDate = toStr || fromStr || todayYmd;

    const digitsOnly = rawSearch.replace(/[^0-9]/g, '');
    const searchLike = `%${rawSearch}%`;
    const searchLowerLike = `%${rawSearch.toLowerCase()}%`;
    const digitsLike = digitsOnly.length >= 3 ? `%${digitsOnly}%` : null;

    const agentScopeSql =
      visibility.scope === 'agent'
        ? 'AND c.agentId = :agentId'
        : (visibility.scope === 'manager' ? 'AND c.agentId IN (:allowedAgentIds)' : '');

    const searchSql = hasSearch
      ? `
        AND (
          c.orderId LIKE :searchLike OR
          c.category LIKE :searchLike OR
          c.notes LIKE :searchLike OR
          c.outcome LIKE :searchLike OR
          LOWER(cu.firstName) LIKE :searchLowerLike OR
          LOWER(cu.lastName) LIKE :searchLowerLike
          ${digitsLike ? 'OR cu.phone LIKE :digitsLike' : ''}
        )
      `
      : '';

    const baseCte = `
      WITH Filtered AS (
        SELECT
          c.id,
          c.customerId,
          c.agentId,
          c.orderId,
          c.callType,
          c.category,
          c.outcome,
          c.reason,
          c.followUpRequired,
          c.followUpDate,
          c.createdAt,
          c.updatedAt,
          CASE WHEN c.orderId IS NOT NULL OR c.orderDetails IS NOT NULL THEN 1 ELSE 0 END AS hasOrder,
          cu.firstName AS customerFirstName,
          cu.lastName AS customerLastName,
          cu.phone AS customerPhone,
          CASE
            WHEN cu.phone IS NULL OR LTRIM(RTRIM(cu.phone)) = '' THEN CONCAT('cust:', c.customerId)
            ELSE RIGHT(
              REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cu.phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''),
              10
            )
          END AS phoneKey,
          u.firstName AS agentFirstName,
          u.lastName AS agentLastName
        FROM dbo.Calls c WITH (NOLOCK)
        LEFT JOIN dbo.Customers cu WITH (NOLOCK) ON cu.id = c.customerId
        LEFT JOIN dbo.Users u WITH (NOLOCK) ON u.id = c.agentId
        WHERE CONVERT(date, DATEADD(MINUTE, 330, c.followUpDate)) >= CONVERT(date, :fromDate)
          AND CONVERT(date, DATEADD(MINUTE, 330, c.followUpDate)) <= CONVERT(date, :toDate)
          AND c.followUpRequired = 1
          AND c.outcome NOT IN ('Lead', 'Order', 'Order Already Placed', 'Reorder')
          AND c.callType = 'Order Upload'
          ${agentScopeSql}
          ${searchSql}
      ),
      Ranked AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY phoneKey
            ORDER BY updatedAt DESC, createdAt DESC, id DESC
          ) AS rn
        FROM Filtered
      )
    `;

    const replacements = {
      fromDate,
      toDate,
      offset,
      pageSize,
      searchLike,
      searchLowerLike,
      digitsLike,
      agentId: req.user.id,
      allowedAgentIds: visibility.allowedAgentIds && visibility.allowedAgentIds.length ? visibility.allowedAgentIds : [0]
    };

    if (isExport) {
      const rows = await sequelize.query(
        `
          ${baseCte}
          SELECT *
          FROM Ranked
          WHERE rn = 1
          ORDER BY CAST(DATEADD(MINUTE, 330, followUpDate) AS DATE) ASC, followUpDate ASC, updatedAt DESC
        `,
        { type: QueryTypes.SELECT, raw: true, replacements }
      );

      const exportRows = (rows || []).map(r => {
        const callTypeLower = (r.callType || '').toString().toLowerCase();
        let type = r.category;
        if (callTypeLower !== 'follow-up upload' && !!r.followUpRequired) {
          type = r.hasOrder ? 'Order Followup' : 'Fresh Followup';
        }

        return {
          'Follow up': r.followUpDate ? new Date(r.followUpDate).toLocaleDateString() : '',
          'Name': `${r.customerFirstName || ''} ${r.customerLastName || ''}`.trim(),
          'Number': r.customerPhone || '',
          'Order ID': r.orderId || '',
          'Type': type || '',
          'Status': r.outcome || '',
          'Reason': r.reason || '',
          'Agent': `${r.agentFirstName || ''} ${r.agentLastName || ''}`.trim()
        };
      });

      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(exportRows);
      xlsx.utils.book_append_sheet(wb, ws, 'Order Followups');
      const b64 = xlsx.write(wb, { type: 'base64', bookType: 'xlsx' });
      const buf = Buffer.from(b64, 'base64');

      res.setHeader('Content-Disposition', 'attachment; filename="OrderFollowups.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Length', String(buf.length));
      res.setHeader('Cache-Control', 'no-store');
      return res.end(buf);
    }

    const countRows = await sequelize.query(
      `
        ${baseCte}
        SELECT COUNT(*) AS total
        FROM Ranked
        WHERE rn = 1
      `,
      { type: QueryTypes.SELECT, raw: true, replacements }
    );
    const total = Number(countRows?.[0]?.total || 0);

    const rows = await sequelize.query(
      `
        ${baseCte}
        SELECT *
        FROM Ranked
        WHERE rn = 1
        ORDER BY CAST(DATEADD(MINUTE, 330, followUpDate) AS DATE) ASC, followUpDate ASC, updatedAt DESC
        OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY
      `,
      { type: QueryTypes.SELECT, raw: true, replacements }
    );

    const data = (rows || []).map(r => {
      const callTypeLower = (r.callType || '').toString().toLowerCase();
      let type = r.category;
      if (callTypeLower !== 'follow-up upload' && !!r.followUpRequired) {
        type = r.hasOrder ? 'Order Followup' : 'Fresh Followup';
      }

      return {
        id: r.id,
        customerId: r.customerId,
        followUpDate: r.followUpDate,
        name: `${r.customerFirstName || ''} ${r.customerLastName || ''}`.trim(),
        number: r.customerPhone || '',
        orderId: r.orderId,
        type,
        outcome: r.outcome,
        reason: r.reason,
        agent: `${r.agentFirstName || ''} ${r.agentLastName || ''}`.trim()
      };
    });

    res.json({ data, total, page, pageSize });
  } catch (error) {
    console.error('getUploadedOrderFollowUps failed:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

exports.getImportantCalls = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const offset = (page - 1) * pageSize;
    const isExport = (req.query.export || '').toString().toLowerCase() === 'true';
    const visibility = await getVisibility(req.user);
    const rawSearch = (req.query.search || '').toString().trim();
    const hasSearch = rawSearch.length > 0;

    const fromStr = (req.query.from || '').toString().trim();
    const toStr = (req.query.to || '').toString().trim();
    const todayYmd = getCurrentISTYMD();
    const fromDate = fromStr || todayYmd;
    const toDate = toStr || fromStr || todayYmd;
    const { startUtc: fromDateUtc } = getISTDayRangeUtc(fromDate);
    const { endUtcExclusive: toDateUtcExclusive } = getISTDayRangeUtc(toDate);

    const digitsOnly = rawSearch.replace(/[^0-9]/g, '');
    const searchLike = `%${rawSearch}%`;
    const searchLowerLike = `%${rawSearch.toLowerCase()}%`;
    const digitsLike = digitsOnly.length >= 3 ? `%${digitsOnly}%` : null;

    const agentScopeSql =
      visibility.scope === 'agent'
        ? 'AND c.agentId = :agentId'
        : (visibility.scope === 'manager' ? 'AND c.agentId IN (:allowedAgentIds)' : '');

    const searchSql = hasSearch
      ? `
        AND (
          c.orderId LIKE :searchLike OR
          c.category LIKE :searchLike OR
          c.notes LIKE :searchLike OR
          c.outcome LIKE :searchLike OR
          LOWER(cu.firstName) LIKE :searchLowerLike OR
          LOWER(cu.lastName) LIKE :searchLowerLike
          ${digitsLike ? 'OR cu.phone LIKE :digitsLike' : ''}
        )
      `
      : '';

    const baseCte = `
      WITH Filtered AS (
        SELECT
          c.id,
          c.customerId,
          c.agentId,
          c.orderId,
          c.callType,
          c.category,
          c.outcome,
          c.reason,
          c.followUpRequired,
          c.followUpDate,
          c.createdAt,
          c.updatedAt,
          CASE WHEN c.orderId IS NOT NULL OR c.orderDetails IS NOT NULL THEN 1 ELSE 0 END AS hasOrder,
          cu.firstName AS customerFirstName,
          cu.lastName AS customerLastName,
          cu.phone AS customerPhone,
          CASE
            WHEN cu.phone IS NULL OR LTRIM(RTRIM(cu.phone)) = '' THEN CONCAT('cust:', c.customerId)
            ELSE RIGHT(
              REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cu.phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''),
              10
            )
          END AS phoneKey,
          u.firstName AS agentFirstName,
          u.lastName AS agentLastName
        FROM dbo.Calls c WITH (NOLOCK)
        LEFT JOIN dbo.Customers cu WITH (NOLOCK) ON cu.id = c.customerId
        LEFT JOIN dbo.Users u WITH (NOLOCK) ON u.id = c.agentId
        WHERE c.followUpDate >= :fromDateUtc
          AND c.followUpDate < :toDateUtcExclusive
          AND c.followUpRequired = 1
          AND c.outcome NOT IN ('Lead', 'Order', 'Order Already Placed', 'Reorder')
          AND c.callType IN ('Imp Call Upload', 'Imp Calls Upload')
          ${agentScopeSql}
          ${searchSql}
      ),
      Ranked AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY phoneKey
            ORDER BY updatedAt DESC, createdAt DESC, id DESC
          ) AS rn
        FROM Filtered
      )
    `;

    const replacements = {
      fromDate,
      toDate,
      fromDateUtc,
      toDateUtcExclusive,
      offset,
      pageSize,
      searchLike,
      searchLowerLike,
      digitsLike,
      agentId: req.user.id,
      allowedAgentIds: visibility.allowedAgentIds && visibility.allowedAgentIds.length ? visibility.allowedAgentIds : [0]
    };

    if (isExport) {
      const rows = await sequelize.query(
        `
          ${baseCte}
          SELECT *
          FROM Ranked
          WHERE rn = 1
          ORDER BY followUpDate ASC, updatedAt DESC
        `,
        { type: QueryTypes.SELECT, raw: true, replacements }
      );

      const exportRows = (rows || []).map(r => ({
        'Follow up': r.followUpDate ? new Date(r.followUpDate).toLocaleDateString() : '',
        'Name': `${r.customerFirstName || ''} ${r.customerLastName || ''}`.trim(),
        'Number': r.customerPhone || '',
        'Order ID': r.orderId || '',
        'Type': r.category || '',
        'Status': r.outcome || '',
        'Reason': r.reason || '',
        'Agent': `${r.agentFirstName || ''} ${r.agentLastName || ''}`.trim()
      }));

      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(exportRows);
      xlsx.utils.book_append_sheet(wb, ws, 'Important Calls');
      const b64 = xlsx.write(wb, { type: 'base64', bookType: 'xlsx' });
      const buf = Buffer.from(b64, 'base64');

      res.setHeader('Content-Disposition', 'attachment; filename="ImportantCalls.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Length', String(buf.length));
      res.setHeader('Cache-Control', 'no-store');
      return res.end(buf);
    }

    const countRows = await sequelize.query(
      `
        ${baseCte}
        SELECT COUNT(*) AS total
        FROM Ranked
        WHERE rn = 1
      `,
      { type: QueryTypes.SELECT, raw: true, replacements }
    );
    const total = Number(countRows?.[0]?.total || 0);

    const rows = await sequelize.query(
      `
        ${baseCte}
        SELECT *
        FROM Ranked
        WHERE rn = 1
        ORDER BY followUpDate ASC, updatedAt DESC
        OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY
      `,
      { type: QueryTypes.SELECT, raw: true, replacements }
    );

    const data = (rows || []).map(r => ({
      id: r.id,
      customerId: r.customerId,
      followUpDate: r.followUpDate,
      name: `${r.customerFirstName || ''} ${r.customerLastName || ''}`.trim(),
      number: r.customerPhone || '',
      orderId: r.orderId,
      type: r.category || '',
      outcome: r.outcome,
      reason: r.reason,
      agent: `${r.agentFirstName || ''} ${r.agentLastName || ''}`.trim()
    }));

    res.json({ data, total, page, pageSize });
  } catch (error) {
    console.error('getImportantCalls failed:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Get active follow-ups
// @route   GET /api/calls/followups
// @access  Private
exports.getFollowUps = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const offset = (page - 1) * pageSize;
    const visibility = await getVisibility(req.user);
    const rawSearch = (req.query.search || '').toString().trim();
    const hasSearch = rawSearch.length > 0;

    const where = {
      followUpRequired: true,
      outcome: { [Op.notIn]: ['Lead', 'Order', 'Order Already Placed', 'Reorder'] }
    };

    let assignmentScopeWhere = null;
    if (visibility.scope === 'agent') {
      assignmentScopeWhere = { AgentId: req.user.id, IsResolved: false };
    } else if (visibility.scope === 'manager') {
      assignmentScopeWhere = {
        AgentId: { [Op.in]: visibility.allowedAgentIds },
        IsResolved: false
      };
    }

    if (assignmentScopeWhere) {
      const assignedCallRows = await CallAssignment.findAll({
        attributes: ['CallId'],
        where: assignmentScopeWhere,
        group: ['CallId']
      });
      const assignedCallIds = assignedCallRows.map((row) => row.CallId);
      if (!assignedCallIds.length) {
        return res.json({ data: [], total: 0, page, pageSize });
      }
      where.id = { [Op.in]: assignedCallIds };
    }

    const include = [
      { model: Customer },
      { model: User, as: 'agent', attributes: ['id', 'firstName', 'lastName'] },
      {
        model: CallAssignment,
        as: 'assignments',
        required: false,
        where: { IsResolved: false },
        attributes: ['id', 'AgentId', 'AssignedBy', 'AssignedAt'],
        include: [
          { model: User, as: 'assignedAgent', attributes: ['id', 'firstName', 'lastName'] }
        ]
      }
    ];

    if (hasSearch) {
      const search = rawSearch.toLowerCase();
      const like = `%${search}%`;
      include[0] = {
        ...include[0],
        where: {
          [Op.or]: [
            sequelize.where(
              sequelize.fn('LOWER', sequelize.col('Customer.firstName')),
              { [Op.like]: like }
            ),
            sequelize.where(
              sequelize.fn('LOWER', sequelize.col('Customer.lastName')),
              { [Op.like]: like }
            ),
            { phone: { [Op.like]: `%${rawSearch}%` } }
          ]
        }
      };
    }

    const { rows, count } = await Call.findAndCountAll({
      where,
      attributes: [
        'id',
        'customerId',
        'agentId',
        'callType',
        'category',
        'outcome',
        'reason',
        'notes',
        'orderId',
        'followUpRequired',
        'followUpDate',
        'createdAt',
        'updatedAt'
      ],
      include,
      order: [['followUpDate', 'ASC']],
      limit: pageSize,
      offset,
      subQuery: false,
      distinct: true
    });

    const data = rows.map((row) => {
      const json = row.toJSON();
      json.assignedAgents = (json.assignments || []).map((assignment) => ({
        id: assignment.AgentId,
        name: `${assignment.assignedAgent?.firstName || ''} ${assignment.assignedAgent?.lastName || ''}`.trim()
      }));
      return json;
    });

    res.json({ data, total: count, page, pageSize });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Update follow-up status (First Order Wins logic) and persist status history
// @route   PUT /api/calls/:id/followup-status
// @access  Private
exports.updateFollowUpStatus = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { status, reason, notes, followUpDate } = req.body;
    const agentId = req.user.id;

    const call = await Call.findByPk(id, { include: [Customer], transaction });
    if (!call) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Call not found' });
    }

    await ensureLegacyAssignment(call, agentId, transaction);
    const visibility = await getVisibility(req.user);
    if (visibility.scope === 'agent') {
      const assigned = await CallAssignment.count({
        where: { CallId: call.id, AgentId: agentId, IsResolved: false },
        transaction
      });
      if (!assigned && call.agentId !== agentId) {
        await transaction.rollback();
        return res.status(403).json({ message: 'You are not assigned to this follow-up' });
      }
    } else if (visibility.scope === 'manager') {
      const assigned = await CallAssignment.count({
        where: {
          CallId: call.id,
          AgentId: { [Op.in]: visibility.allowedAgentIds },
          IsResolved: false
        },
        transaction
      });
      if (!assigned && !visibility.allowedAgentIds.includes(call.agentId)) {
        await transaction.rollback();
        return res.status(403).json({ message: 'You are not allowed to update this follow-up' });
      }
    }

    const previousOutcome = call.outcome || null;
    const keepsPending = ['Re-Follow-up', 'No Answer'].includes(status);

    call.outcome = status;
    call.reason = reason;
    call.updatedBy = agentId;
    if (notes) {
      call.notes = (call.notes ? call.notes + '\n' : '') + `[${new Date().toISOString()}] ${notes}`;
    }
    if (keepsPending) {
      if (followUpDate) {
        const d = new Date(followUpDate);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = d.getMonth();
          const day = d.getDate();
          const normalized = new Date(y, m, day, 0, 0, 0, 0);
          call.followUpRequired = true;
          call.followUpDate = normalized;
          call.resolvedBy = null;
          call.resolvedAt = null;
        }
      }
    } else {
      call.followUpRequired = false;
      call.followUpDate = null;
      call.resolvedBy = agentId;
      call.resolvedAt = new Date();
    }

    await call.save({ transaction });

    // Append status history for every update to track interactions
    if (status) {
      try {
        const { CallStatusHistory } = require('../models');
        await CallStatusHistory.create({
          CallId: call.id,
          PreviousStatus: previousOutcome,
          NewStatus: status,
          ChangedBy: agentId
        }, { transaction });
      } catch (e) {
        console.error('Failed to persist follow-up status history', e);
      }
    }

    const toLast10Digits = (v) => {
      const digits = (v || '').toString().replace(/[^0-9]/g, '');
      if (!digits) return null;
      return digits.length > 10 ? digits.slice(-10) : digits;
    };

    const last10 = toLast10Digits(call?.Customer?.phone);

    if (status === 'Re-Follow-up' && call.followUpRequired && last10) {
      const customersWithSamePhone = await Customer.findAll({
        where: { phone: { [Op.like]: `%${last10}` } },
        attributes: ['id', 'phone'],
        transaction
      });
      const customerIds = customersWithSamePhone
        .filter(c => toLast10Digits(c.phone) === last10)
        .map(c => c.id);
      if (customerIds.length) {
        const otherCalls = await Call.findAll({
          attributes: ['id'],
          where: {
            customerId: { [Op.in]: customerIds },
            id: { [Op.ne]: id },
            followUpRequired: true
          },
          transaction
        });
        await Call.update(
          {
            followUpRequired: false,
            followUpDate: null,
            reason: 'Follow-up rescheduled by another agent',
            updatedBy: agentId,
            resolvedBy: agentId,
            resolvedAt: new Date()
          },
          {
            where: {
              customerId: { [Op.in]: customerIds },
              id: { [Op.ne]: id }, // Exclude current call
              followUpRequired: true
            },
            transaction
          }
        );
        if (otherCalls.length) {
          await CallAssignment.update(
            {
              IsResolved: true,
              ResolvedBy: agentId,
              ResolvedAt: new Date()
            },
            {
              where: {
                CallId: { [Op.in]: otherCalls.map((row) => row.id) },
                IsResolved: false
              },
              transaction
            }
          );
        }
      }
    }

    // Critical Logic: First Order Wins
    if (status === 'Order') {
      const customersWithSamePhone = last10
        ? await Customer.findAll({
          where: { phone: { [Op.like]: `%${last10}` } },
          attributes: ['id', 'phone'],
          transaction
        })
        : [];
      const customerIds = customersWithSamePhone
        .filter(c => toLast10Digits(c.phone) === last10)
        .map(c => c.id);

      // Update other follow-ups
      await Call.update(
        {
          outcome: 'Order Already Placed',
          reason: 'Order placed by another agent',
          followUpRequired: false,
          followUpDate: null,
          updatedBy: agentId,
          resolvedBy: agentId,
          resolvedAt: new Date()
        },
        {
          where: {
            customerId: { [Op.in]: customerIds },
            id: { [Op.ne]: id }, // Exclude current call
            followUpRequired: true,
            outcome: { [Op.notIn]: ['Order', 'Order Already Placed'] }
          },
          transaction
        }
      );
    }

    if (keepsPending) {
      const activeAssignments = await CallAssignment.findAll({
        attributes: ['AgentId'],
        where: { CallId: call.id, IsResolved: false },
        transaction
      });
      const fallbackAssignedAgentIds = activeAssignments.map((row) => row.AgentId);
      await syncCallAssignments(call, fallbackAssignedAgentIds, agentId, transaction);
      await call.save({ transaction });
    } else {
      await resolveAssignmentsForCall(call.id, agentId, transaction);
    }

    await transaction.commit();
    res.json({ message: 'Follow-up updated successfully', call });

  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Get call by ID
// @route   GET /api/calls/:id
// @access  Private
exports.getCallById = async (req, res) => {
  try {
    const call = await Call.findByPk(req.params.id, {
      include: [
        { model: Customer },
        { model: User, as: 'agent', attributes: ['id', 'firstName', 'lastName'] },
        {
          model: CallAssignment,
          as: 'assignments',
          required: false,
          where: { IsResolved: false },
          attributes: ['AgentId', 'AssignedAt'],
          include: [{ model: User, as: 'assignedAgent', attributes: ['id', 'firstName', 'lastName'] }]
        }
      ]
    });

    if (!call) {
      res.status(404).json({ message: 'Call not found' });
      return;
    }

    if (!(await canUserViewCall(call, req.user))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const data = call.toJSON();
    data.assignedAgents = (data.assignments || []).map((assignment) => ({
      id: assignment.AgentId,
      name: `${assignment.assignedAgent?.firstName || ''} ${assignment.assignedAgent?.lastName || ''}`.trim()
    }));
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Transfer follow-up to another agent (admin only)
// @route   PUT /api/calls/:id/transfer-followup
// @access  Private (Admin, Super Admin)
exports.transferFollowup = async (req, res) => {
  try {
    const { id } = req.params;
    const { newAgentId, agentIds } = req.body || {};
    const desiredAgentIds = normalizeAgentIds(agentIds, newAgentId);
    if (!desiredAgentIds.length) {
      return res.status(400).json({ message: 'At least one target agent is required' });
    }

    const call = await Call.findByPk(id);
    if (!call) {
      return res.status(404).json({ message: 'Follow-up not found' });
    }

    const agents = await User.findAll({
      where: { id: { [Op.in]: desiredAgentIds } },
      attributes: ['id']
    });
    if (agents.length !== desiredAgentIds.length) {
      return res.status(400).json({ message: 'One or more target agents were not found' });
    }

    await ensureLegacyAssignment(call, req.user?.id, null);
    await syncCallAssignments(call, desiredAgentIds, req.user?.id, null);
    call.updatedBy = req.user?.id || call.updatedBy;
    await call.save();

    res.json({ message: 'Follow-up assignment updated successfully' });
  } catch (error) {
    console.error('Transfer follow-up failed:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Create a call
// @route   POST /api/calls
// @access  Private
exports.createCall = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      customerId,
      agentId,
      assignedAgentIds,
      callType,
      category,
      date,
      duration,
      notes,
      outcome,
      orderId,
      orderDetails,
      refundDetails,
      followUpRequired,
      followUpDate
    } = req.body;

    // Sanitize empty orderDetails: treat empty object/array/string as NULL
    let sanitizedOrderDetails = orderDetails;
    try {
      if (typeof sanitizedOrderDetails === 'string') {
        const parsed = JSON.parse(sanitizedOrderDetails);
        sanitizedOrderDetails = parsed;
      }
    } catch { }
    if (sanitizedOrderDetails && typeof sanitizedOrderDetails === 'object') {
      const keys = Array.isArray(sanitizedOrderDetails)
        ? sanitizedOrderDetails.length
        : Object.keys(sanitizedOrderDetails).length;
      if (keys === 0) sanitizedOrderDetails = null;
    }

    // Validate follow-up requirements
    const mustHaveFollowUpDate = requiresFollowUpDate(callType, category, outcome);
    if (mustHaveFollowUpDate && !followUpDate) {
      await transaction.rollback();
      return res.status(422).json({
        message: 'Follow-up date is required for this interaction',
        rule: 'outbound > sales-call > followup OR inbound > new order related > follow-up scheduled'
      });
    }

    const finalAgentId = agentId || (req.user ? req.user.id : null);
    const actorId = req.user ? req.user.id : finalAgentId;
    const finalAssignedAgentIds = normalizeAgentIds(assignedAgentIds, finalAgentId);

    const call = await Call.create({
      customerId,
      agentId: finalAgentId,
      callType,
      category,
      date,
      duration,
      notes,
      outcome,
      orderId,
      orderDetails: sanitizedOrderDetails,
      refundDetails,
      followUpRequired: mustHaveFollowUpDate ? true : !!followUpRequired,
      followUpDate: followUpDate || null,
      createdBy: actorId,
      updatedBy: actorId,
      resolvedBy: null,
      resolvedAt: null
    }, { transaction });

    if (call.followUpRequired) {
      await syncCallAssignments(call, finalAssignedAgentIds, actorId, transaction);
      await call.save({ transaction });
    }

    // Append status history for initial creation
    if (outcome) {
      const { CallStatusHistory } = require('../models');
      await CallStatusHistory.create({
        CallId: call.id,
        PreviousStatus: null,
        NewStatus: outcome,
        ChangedBy: actorId
      }, { transaction });
    }

    const toLast10Digits = (v) => {
      const digits = (v || '').toString().replace(/[^0-9]/g, '');
      if (!digits) return null;
      return digits.length > 10 ? digits.slice(-10) : digits;
    };

    const customer = customerId ? await Customer.findByPk(customerId, { transaction }) : null;
    const last10 = toLast10Digits(customer?.phone);
    if (last10) {
      const customersWithSamePhone = await Customer.findAll({
        where: { phone: { [Op.like]: `%${last10}` } },
        attributes: ['id', 'phone'],
        transaction
      });
      const customerIds = customersWithSamePhone
        .filter(c => toLast10Digits(c.phone) === last10)
        .map(c => c.id);

      if (call.followUpRequired && customerIds.length) {
        const supersededCalls = await Call.findAll({
          attributes: ['id'],
          where: {
            customerId: { [Op.in]: customerIds },
            id: { [Op.ne]: call.id },
            followUpRequired: true
          },
          transaction
        });
        await Call.update(
          {
            followUpRequired: false,
            followUpDate: null,
            updatedBy: actorId,
            resolvedBy: actorId,
            resolvedAt: new Date()
          },
          {
            where: {
              customerId: { [Op.in]: customerIds },
              id: { [Op.ne]: call.id },
              followUpRequired: true
            },
            transaction
          }
        );
        if (supersededCalls.length) {
          await CallAssignment.update(
            {
              IsResolved: true,
              ResolvedBy: actorId,
              ResolvedAt: new Date()
            },
            {
              where: {
                CallId: { [Op.in]: supersededCalls.map((row) => row.id) },
                IsResolved: false
              },
              transaction
            }
          );
        }
      }

      if ((call.outcome || '') === 'Order' && customerIds.length) {
        const orderClearedCalls = await Call.findAll({
          attributes: ['id'],
          where: {
            customerId: { [Op.in]: customerIds },
            id: { [Op.ne]: call.id },
            followUpRequired: true,
            outcome: { [Op.notIn]: ['Order', 'Order Already Placed'] }
          },
          transaction
        });
        await Call.update(
          {
            outcome: 'Order Already Placed',
            reason: 'Order placed by another agent',
            followUpRequired: false,
            followUpDate: null,
            updatedBy: actorId,
            resolvedBy: actorId,
            resolvedAt: new Date()
          },
          {
            where: {
              customerId: { [Op.in]: customerIds },
              id: { [Op.ne]: call.id },
              followUpRequired: true,
              outcome: { [Op.notIn]: ['Order', 'Order Already Placed'] }
            },
            transaction
          }
        );
        if (orderClearedCalls.length) {
          await CallAssignment.update(
            {
              IsResolved: true,
              ResolvedBy: actorId,
              ResolvedAt: new Date()
            },
            {
              where: {
                CallId: { [Op.in]: orderClearedCalls.map((row) => row.id) },
                IsResolved: false
              },
              transaction
            }
          );
        }
      }
    }

    // --- AUTO-CLOSE LOGIC: Update pending "Order Upload" and "Follow-up Upload" tasks ---
    // If an agent logs a new call for this customer, we assume they are working the list.
    // We update the original "task" record so it drops off the "To Do" lists.
    const newOutcome = outcome || 'Worked';

    // 1. Close pending Reorders (Order Upload)
    await Call.update(
      {
        outcome: newOutcome
      },
      {
        where: {
          customerId,
          callType: 'Order Upload',
          outcome: { [Op.or]: ['Completed', null, ''] }
        },
        transaction
      }
    );

    // 2. Close pending Follow-up Uploads
    await Call.update(
      {
        outcome: newOutcome
      },
      {
        where: {
          customerId,
          callType: { [Op.in]: ['Follow-up Upload', 'Followup Upload', 'follow-up upload', 'followup upload'] },
          outcome: { [Op.or]: ['Follow-up', null, ''] }
        },
        transaction
      }
    );
    // -----------------------------------------------------------------------------------

    await transaction.commit();
    res.status(201).json({
      id: call.id,
      customerId: call.customerId,
      agentId: call.agentId,
      outcome: call.outcome,
      followUpRequired: call.followUpRequired,
      followUpDate: call.followUpDate,
      createdAt: call.createdAt
    });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Update a call
// @route   PUT /api/calls/:id
// @access  Private
exports.updateCall = async (req, res) => {
  try {
    const call = await Call.findByPk(req.params.id);

    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }

    const {
      customerId,
      agentId,
      assignedAgentIds,
      callType,
      category,
      date,
      duration,
      notes,
      outcome,
      orderId,
      orderDetails,
      refundDetails,
      followUpRequired,
      followUpDate
    } = req.body;

    const previousOutcome = call.outcome;

    // Validate follow-up requirements against incoming changes
    const nextType = callType !== undefined ? callType : call.callType;
    const nextCategory = category !== undefined ? category : call.category;
    const nextOutcome = outcome !== undefined ? outcome : call.outcome;
    const mustHaveFollowUpDate = requiresFollowUpDate(nextType, nextCategory, nextOutcome);
    if (mustHaveFollowUpDate && (followUpDate === undefined ? !call.followUpDate : !followUpDate)) {
      return res.status(422).json({
        message: 'Follow-up date is required for this interaction',
        rule: 'outbound > sales-call > followup OR inbound > new order related > follow-up scheduled'
      });
    }

    // Sanitize empty orderDetails on update
    let sanitizedOrderDetails = orderDetails;
    try {
      if (typeof sanitizedOrderDetails === 'string') {
        const parsed = JSON.parse(sanitizedOrderDetails);
        sanitizedOrderDetails = parsed;
      }
    } catch { }
    if (sanitizedOrderDetails && typeof sanitizedOrderDetails === 'object') {
      const keys = Array.isArray(sanitizedOrderDetails)
        ? sanitizedOrderDetails.length
        : Object.keys(sanitizedOrderDetails).length;
      if (keys === 0) sanitizedOrderDetails = null;
    }

    // Update call fields
    if (customerId) call.customerId = customerId;
    if (agentId) call.agentId = agentId;
    if (callType) call.callType = callType;
    if (category !== undefined) call.category = category;
    if (date) call.date = date;
    if (duration !== undefined) call.duration = duration;
    if (notes !== undefined) call.notes = notes;
    if (outcome) call.outcome = outcome;
    if (orderId !== undefined) call.orderId = orderId;
    if (orderDetails !== undefined) call.orderDetails = sanitizedOrderDetails;
    if (refundDetails !== undefined) call.refundDetails = refundDetails;
    if (followUpRequired !== undefined) call.followUpRequired = mustHaveFollowUpDate ? true : !!followUpRequired;
    if (followUpDate !== undefined) call.followUpDate = followUpDate || null;
    if (followUpRequired !== undefined && !call.followUpRequired) call.followUpDate = null;
    call.updatedBy = req.user ? req.user.id : call.updatedBy;
    if (call.followUpRequired) {
      call.resolvedBy = null;
      call.resolvedAt = null;
    } else {
      call.resolvedBy = req.user ? req.user.id : call.resolvedBy;
      call.resolvedAt = new Date();
    }

    await call.save();

    await ensureLegacyAssignment(call, req.user?.id, null);
    if (call.followUpRequired) {
      const nextAssignedAgentIds = normalizeAgentIds(assignedAgentIds, call.agentId);
      await syncCallAssignments(call, nextAssignedAgentIds, req.user?.id, null);
      await call.save();
    } else {
      await resolveAssignmentsForCall(call.id, req.user?.id, null);
    }

    if (call.followUpRequired && call.customerId) {
      try {
        const toLast10Digits = (v) => {
          const digits = (v || '').toString().replace(/[^0-9]/g, '');
          if (!digits) return null;
          return digits.length > 10 ? digits.slice(-10) : digits;
        };
        const customer = await Customer.findByPk(call.customerId, { attributes: ['id', 'phone'] });
        const last10 = toLast10Digits(customer?.phone);
        if (last10) {
          const customersWithSamePhone = await Customer.findAll({
            where: { phone: { [Op.like]: `%${last10}` } },
            attributes: ['id', 'phone']
          });
          const customerIds = customersWithSamePhone
            .filter(c => toLast10Digits(c.phone) === last10)
            .map(c => c.id);
          if (customerIds.length) {
            const supersededCalls = await Call.findAll({
              attributes: ['id'],
              where: {
                customerId: { [Op.in]: customerIds },
                id: { [Op.ne]: call.id },
                followUpRequired: true
              }
            });
            await Call.update(
              {
                followUpRequired: false,
                followUpDate: null,
                reason: 'Superseded by newer follow-up date',
                updatedBy: req.user ? req.user.id : null,
                resolvedBy: req.user ? req.user.id : null,
                resolvedAt: new Date()
              },
              {
                where: {
                  customerId: { [Op.in]: customerIds },
                  id: { [Op.ne]: call.id },
                  followUpRequired: true
                }
              }
            );
            if (supersededCalls.length) {
              await CallAssignment.update(
                {
                  IsResolved: true,
                  ResolvedBy: req.user ? req.user.id : null,
                  ResolvedAt: new Date()
                },
                {
                  where: {
                    CallId: { [Op.in]: supersededCalls.map((row) => row.id) },
                    IsResolved: false
                  }
                }
              );
            }
          }
        }
      } catch (e) {
        console.error('Failed to clear older follow-ups after call update', e);
      }
    }

    // Append status history when outcome changed
    if (outcome && previousOutcome !== outcome) {
      try {
        const { CallStatusHistory } = require('../models');
        await CallStatusHistory.create({
          CallId: call.id,
          PreviousStatus: previousOutcome || null,
          NewStatus: outcome,
          ChangedBy: req.user ? req.user.id : null
        });
      } catch (e) {
        console.error('Failed to persist status history', e);
      }
    }
    res.json({
      id: call.id,
      customerId: call.customerId,
      agentId: call.agentId,
      outcome: call.outcome,
      followUpRequired: call.followUpRequired,
      followUpDate: call.followUpDate,
      updatedAt: call.updatedAt
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Delete a call
// @route   DELETE /api/calls/:id
// @access  Private
exports.deleteCall = async (req, res) => {
  try {
    const call = await Call.findByPk(req.params.id);

    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }

    await call.destroy();
    res.json({ message: 'Call removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// Visibility helpers
const getRoleName = async (user) => {
  if (!user) return null;
  const role = await Role.findByPk(user.roleId);
  return role ? role.name : null;
};

const getManagedAgentIds = async (managerId) => {
  const agents = await User.findAll({ where: { managerId }, attributes: ['id'] });
  return agents.map(a => a.id);
};

const getVisibility = async (user) => {
  const roleNameRaw = await getRoleName(user);
  const roleName = (roleNameRaw || '').toString();
  const roleNameLower = roleName.toLowerCase();
  const roleId = Number(user?.roleId);

  // Admins by name or roleId (1,2) and Orders Viewer (1004) treated as admin for visibility
  if (
    ['superadmin', 'super admin', 'admin', 'orders viewer', 'vieworder'].includes(roleNameLower) ||
    [1, 2, 1004].includes(roleId)
  ) {
    return { scope: 'admin' };
  }

  // Managers / team leaders by name or roleId (3)
  if (['manager', 'team leader', 'teamleader', 'team_leader'].includes(roleNameLower) || roleId === 3) {
    const teamIds = await getManagedAgentIds(user.id);
    return { scope: 'manager', allowedAgentIds: [...teamIds, user.id] };
  }

  // Default: agent scope
  return { scope: 'agent', allowedAgentIds: [user.id] };
};

// @desc    Get recent calls (role-based visibility)
// @route   GET /api/calls/recent
// @access  Private
exports.getRecentCalls = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const visibility = await getVisibility(req.user);
    const where = (visibility.scope === 'admin')
      ? {}
      : (visibility.scope === 'manager')
        ? { agentId: { [Op.in]: visibility.allowedAgentIds } }
        : { agentId: req.user.id };

    const calls = await Call.findAll({
      where,
      include: [
        { model: Customer },
        { model: User, as: 'agent', attributes: ['id', 'firstName', 'lastName'] }
      ],
      order: [['date', 'DESC']],
      limit
    });

    res.json(calls);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Get daily top callers with call count (role-based visibility)
// @route   GET /api/calls/top-callers/daily
// @access  Private
exports.getTopCallersDaily = async (req, res) => {
  try {
    const dateParam = req.query.date ? new Date(req.query.date) : new Date();
    const start = new Date(dateParam);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateParam);
    end.setHours(23, 59, 59, 999);
    const limit = parseInt(req.query.limit, 10) || 10;

    const where = {
      date: { [Op.between]: [start, end] }
    };
    const visibility = await getVisibility(req.user);
    if (visibility.scope === 'agent') where.agentId = req.user.id;
    if (visibility.scope === 'manager') where.agentId = { [Op.in]: visibility.allowedAgentIds };

    const rows = await Call.findAll({
      where,
      attributes: [
        'customerId',
        [sequelize.fn('COUNT', sequelize.col('customerId')), 'callCount']
      ],
      include: [{ model: Customer, attributes: ['id', 'firstName', 'lastName', 'phone'] }],
      group: ['customerId', 'Customer.id', 'Customer.firstName', 'Customer.lastName', 'Customer.phone'],
      order: [[sequelize.literal('callCount'), 'DESC']],
      limit
    });

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Recent Order Details (by date, default today) with pagination, sorting, search
// @route   GET /api/calls/orders/recent
// @access  Private
exports.getRecentOrderDetails = async (req, res) => {
  try {
    // Optional date filter (YYYY-MM-DD). If absent, use today.
    const dateStr = (req.query.date || '').toString().trim();
    const parseLocalYMD = (s) => {
      if (!s) return null;
      const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
      if (!m) return null;
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const d = parseInt(m[3], 10);
      return new Date(y, mo, d, 0, 0, 0, 0); // local midnight
    };
    const base = parseLocalYMD(dateStr) || new Date();
    const start = new Date(base); start.setHours(0, 0, 0, 0);
    const end = new Date(base); end.setHours(23, 59, 59, 999);
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const sortBy = (req.query.sortBy || 'createdAt').toString();
    const sortOrder = ((req.query.sortOrder || 'DESC').toString().toUpperCase() === 'ASC') ? 'ASC' : 'DESC';
    const searchTerm = (req.query.search || '').toString().trim();
    const requestedAgentId = req.query.agentId ? parseInt(req.query.agentId, 10) : null;

    // Visibility: Agents see own; Managers see their team; Admins can filter any agent
    const visibility = await getVisibility(req.user);
    const applyDateFilter = !!dateStr || visibility.scope !== 'admin';
    const where = {
      [Op.and]: [
        ...(applyDateFilter ? [{ createdAt: { [Op.between]: [start, end] } }] : []),
        {
          [Op.or]: [
            // Allow any call that has non-empty structured orderDetails
            sequelize.literal("orderDetails IS NOT NULL AND LEN(orderDetails) > 2 AND LOWER(callType) NOT IN ('imp call upload', 'imp calls upload')"),
            // Allow orderId-only calls except FollowUp outcomes
            {
              [Op.and]: [
                sequelize.where(sequelize.fn('LOWER', sequelize.col('callType')), { [Op.notIn]: ['imp call upload', 'imp calls upload'] }),
                { orderId: { [Op.ne]: null } },
                { outcome: { [Op.notIn]: ['No', 'follow-up-scheduled'] } }
              ]
            }
          ]
        }
      ]
    };

    if (visibility.scope === 'agent') {
      where.agentId = req.user.id;
    } else if (visibility.scope === 'manager') {
      where.agentId = { [Op.in]: visibility.allowedAgentIds };
    } else if (visibility.scope === 'admin') {
      if (requestedAgentId) where.agentId = requestedAgentId;
    }

    // Apply search across orderId, customer phone/name, and NVARCHAR orderDetails JSON string
    if (searchTerm) {
      const digits = searchTerm.replace(/[^0-9]/g, '');
      const like = { [Op.like]: `%${searchTerm}%` };
      const ors = [
        { orderId: like },
        { notes: like },
        { outcome: like }
      ];
      if (digits.length >= 5) {
        // join customer phone via include where
      }

      // We'll apply customer name/phone filter through include below
      req._searchTerm = searchTerm; // pass to include
      req._searchDigits = digits;
    }

    const offset = (page - 1) * pageSize;
    const allowedSort = ['createdAt', 'date', 'orderId'];
    const order = allowedSort.includes(sortBy) ? [[sortBy, sortOrder]] : [['createdAt', 'DESC']];

    const include = [
      // Customer include with optional search
      (req._searchTerm ? {
        model: Customer, where: {
          [Op.or]: [
            { firstName: { [Op.like]: `%${req._searchTerm}%` } },
            { lastName: { [Op.like]: `%${req._searchTerm}%` } },
            ...(req._searchDigits && req._searchDigits.length >= 5 ? [{ phone: { [Op.like]: `%${req._searchDigits}%` } }] : [])
          ]
        }, required: false
      } : { model: Customer }),
      { model: User, as: 'agent', attributes: ['id', 'firstName', 'lastName'] }
    ];

    const { rows, count } = await Call.findAndCountAll({
      // Use computed column HasOrder for performance when possible
      where: {
        [Op.and]: [
          sequelize.where(sequelize.col('HasOrder'), 1),
          where
        ]
      },
      include,
      order,
      limit: pageSize,
      offset
    });

    // Normalize NVARCHAR JSON
    const data = rows.map(r => ({
      id: r.id,
      createdAt: r.createdAt,
      date: r.date,
      agent: r.agent,
      customer: r.Customer,
      orderId: r.orderId,
      orderDetails: typeof r.orderDetails === 'string' ? (function () { try { return JSON.parse(r.orderDetails); } catch { return null; } })() : r.orderDetails
    }));

    res.json({ data, total: count, page, pageSize });
  } catch (error) {
    console.error('Recent order details failed:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Recent Orders count (by date, default today) — optimized count-only without joins
// @route   GET /api/calls/orders/recent/count
// @access  Private
exports.getRecentOrderCount = async (req, res) => {
  try {
    // Optional date filter (YYYY-MM-DD). If absent, use today.
    const dateStr = (req.query.date || '').toString().trim();
    const parseLocalYMD = (s) => {
      if (!s) return null;
      const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
      if (!m) return null;
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const d = parseInt(m[3], 10);
      return new Date(y, mo, d, 0, 0, 0, 0); // local midnight
    };
    const base = parseLocalYMD(dateStr) || new Date();
    const start = new Date(base); start.setHours(0, 0, 0, 0);
    const end = new Date(base); end.setHours(23, 59, 59, 999);
    const requestedAgentId = req.query.agentId ? parseInt(req.query.agentId, 10) : null;
    const search = (req.query.search || '').trim();

    const visibility = await getVisibility(req.user);
    const applyDateFilter = !!dateStr || visibility.scope !== 'admin';
    // Orders today should count:
    // 1) Normal orders (non 'Order Upload') that have HasOrder=1
    // 2) Reorders where agent tagged outcome = 'Order Created' (callType 'Order Upload')
    const where = {
      [Op.and]: [
        {
          [Op.or]: [
            // Non-reorder orders with HasOrder flag
            {
              [Op.and]: [
                sequelize.where(sequelize.fn('LOWER', sequelize.col('callType')), { [Op.notIn]: ['order upload', 'imp call upload', 'imp calls upload'] }),
                sequelize.where(sequelize.col('HasOrder'), 1)
              ]
            },
            // Reorders that resulted in Order Created
            {
              [Op.and]: [
                sequelize.where(sequelize.fn('LOWER', sequelize.col('callType')), 'order upload'),
                { outcome: 'Order Created' }
              ]
            }
          ]
        },
        ...(applyDateFilter ? [{ createdAt: { [Op.between]: [start, end] } }] : [])
      ]
    };

    if (visibility.scope === 'agent') {
      where.agentId = req.user.id;
    } else if (visibility.scope === 'manager') {
      where.agentId = { [Op.in]: visibility.allowedAgentIds };
    } else if (visibility.scope === 'admin') {
      if (requestedAgentId) where.agentId = requestedAgentId;
    }

    const total = await Call.count({ where });
    return res.json({ total });
  } catch (error) {
    console.error('Recent order count failed:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Followup Report: orders with follow-up date in requested range (defaults to today only)
// @route   GET /api/calls/orders/followups
// @access  Private (role-based visibility)
exports.getFollowupReport = async (req, res) => {
  try {
    // Accept optional query params: from (YYYY-MM-DD), to (YYYY-MM-DD)
    // If not provided, default to TODAY ONLY (IST)
    const fromStr = (req.query.from || '').toString().trim();
    const toStr = (req.query.to || '').toString().trim();
    const todayStr = new Date().toISOString().slice(0, 10);

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const sortBy = (req.query.sortBy || 'followUpDate').toString();
    const sortOrder = ((req.query.sortOrder || 'ASC').toString().toUpperCase() === 'DESC') ? 'DESC' : 'ASC';
    const requestedAgentId = req.query.agentId ? parseInt(req.query.agentId, 10) : null;

    const visibility = await getVisibility(req.user);
    const applyDateFilter = !!fromStr || !!toStr || visibility.scope !== 'admin';
    const fd = fromStr || todayStr;
    const td = toStr || fromStr || todayStr;
    const dateFilter = applyDateFilter ? sequelize.where(
      sequelize.literal('CAST(DATEADD(MINUTE, 330, followUpDate) AS DATE)'),
      { [Op.between]: [fd, td] }
    ) : {};

    // Strict scenarios allowed:
    // 1) Inbound > New order related > follow-up-scheduled
    // 2) Outbound > Sales Call > FollowUp (stored as outcome 'No')
    const inboundFollowScheduled = [
      sequelize.where(sequelize.fn('LOWER', sequelize.col('callType')), 'inbound'),
      sequelize.where(sequelize.fn('LOWER', sequelize.col('category')), { [Op.in]: ['new order related', 'new-order-related', 'new_order_related'] }),
      sequelize.where(sequelize.fn('LOWER', sequelize.col('outcome')), 'follow-up-scheduled')
    ];
    const outboundSalesFollowup = [
      sequelize.where(sequelize.fn('LOWER', sequelize.col('callType')), 'outbound'),
      sequelize.where(sequelize.fn('LOWER', sequelize.col('category')), { [Op.in]: ['sales-call', 'sales call', 'sales_call'] }),
      sequelize.where(sequelize.fn('LOWER', sequelize.col('outcome')), 'no')
    ];
    const bulkUploadFollowups = [
      sequelize.where(sequelize.fn('LOWER', sequelize.col('callType')), { [Op.in]: ['follow-up upload', 'followup upload', 'followups upload'] }),
      { followUpRequired: true },
      // Only show initial state outcomes (Follow-up, null, empty)
      // If agent updates it to 'Ringing', 'Order', etc., it should disappear
      { outcome: { [Op.or]: [{ [Op.eq]: 'Follow-up' }, { [Op.is]: null }, { [Op.eq]: '' }] } }
    ];

    const where = {
      [Op.and]: [
        {
          [Op.or]: [
            // With order id: use followUpDate range and match ONLY inbound scheduled scenario
            { [Op.and]: [{ orderId: { [Op.ne]: null } }, dateFilter, ...inboundFollowScheduled] },
            // Without order id: use followUpDate range and match ONLY outbound followup scenario
            { [Op.and]: [{ orderId: { [Op.eq]: null } }, dateFilter, ...outboundSalesFollowup] },
            // Bulk uploaded follow-ups (may or may not have orderId)
            { [Op.and]: [dateFilter, ...bulkUploadFollowups] }
          ]
        }
      ]
    };

    // Role-based visibility
    if (visibility.scope === 'agent') {
      where.agentId = req.user.id;
    } else if (visibility.scope === 'manager') {
      // Allow manager to view their team (and themselves)
      where.agentId = { [Op.in]: visibility.allowedAgentIds };
    } else if (visibility.scope === 'admin') {
      if (requestedAgentId) where.agentId = requestedAgentId;
    }

    // Search logic (Customer Name, Phone, or Order ID)
    if (search) {
      const searchLike = `%${search}%`;
      const searchOrs = [
        { '$Customer.firstName$': { [Op.like]: searchLike } },
        { '$Customer.lastName$': { [Op.like]: searchLike } },
        { orderId: { [Op.like]: searchLike } }
      ];

      // Add phone search if digits present
      const digitsOnly = search.replace(/[^0-9]/g, '');
      if (digitsOnly.length >= 3) {
        searchOrs.push({ '$Customer.phone$': { [Op.like]: `%${digitsOnly}%` } });
      }

      // We must push to the top-level Op.and array
      where[Op.and].push({
        [Op.or]: searchOrs
      });
    }

    // Export logic
    if (req.query.export === 'true') {
      // Use subQuery: false to allow filtering by included Customer columns
      const rows = await Call.findAll({
        where,
        include: [
          { model: Customer, attributes: ['firstName', 'lastName', 'phone'] },
          { model: User, as: 'agent', attributes: ['firstName', 'lastName'] }
        ],
        order: [['followUpDate', 'ASC']],
        subQuery: false,
        raw: true,
        nest: true
      });

      const exportData = rows.map(r => ({
        'Date': r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '',
        'Customer Name': r.Customer ? `${r.Customer.firstName} ${r.Customer.lastName || ''}`.trim() : 'N/A',
        'Phone': r.Customer ? r.Customer.phone : 'N/A',
        'Agent': r.agent ? `${r.agent.firstName} ${r.agent.lastName}`.trim() : 'N/A',
        'Follow Up Date': r.followUpDate ? new Date(r.followUpDate).toLocaleDateString() : '',
        'Order ID': r.orderId || '',
        'Outcome': r.outcome,
        'Notes': r.notes
      }));

      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(exportData);
      xlsx.utils.book_append_sheet(wb, ws, 'FollowUps');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', 'attachment; filename="FollowupReport.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buf);
    }

    const offset = (page - 1) * pageSize;
    const allowedSort = ['followUpDate', 'createdAt', 'orderId'];
    const order = allowedSort.includes(sortBy) ? [[sortBy, sortOrder]] : [['followUpDate', 'ASC']];

    const { rows, count } = await Call.findAndCountAll({
      where,
      include: [
        { model: Customer },
        { model: User, as: 'agent', attributes: ['id', 'firstName', 'lastName'] }
      ],
      order,
      limit: pageSize,
      offset,
      subQuery: false // IMPORTANT: Required for filtering by associated model columns (Customer) with pagination
    });

    const data = rows.map(r => ({
      id: r.id,
      createdAt: r.createdAt,
      followUpDate: r.followUpDate,
      agent: r.agent,
      customer: r.Customer,
      orderId: r.orderId,
      orderDetails: typeof r.orderDetails === 'string' ? (function () { try { return JSON.parse(r.orderDetails); } catch { return null; } })() : r.orderDetails
    }));

    res.json({ data, total: count, page, pageSize });
  } catch (error) {
    console.error('Followup report failed:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Get weekly top callers (last 7 days) with call count
// @route   GET /api/calls/top-callers/weekly
// @access  Private
exports.getTopCallersWeekly = async (req, res) => {
  try {
    const now = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const start = req.query.startDate ? new Date(req.query.startDate) : new Date(now);
    if (!req.query.startDate) {
      start.setDate(now.getDate() - 6);
    }
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const limit = parseInt(req.query.limit, 10) || 10;

    const where = {
      date: { [Op.between]: [start, end] }
    };
    const visibility = await getVisibility(req.user);
    if (visibility.scope === 'agent') where.agentId = req.user.id;
    if (visibility.scope === 'manager') where.agentId = { [Op.in]: visibility.allowedAgentIds };

    const rows = await Call.findAll({
      where,
      attributes: [
        'customerId',
        [sequelize.fn('COUNT', sequelize.col('customerId')), 'callCount']
      ],
      include: [{ model: Customer, attributes: ['id', 'firstName', 'lastName', 'phone'] }],
      group: ['customerId', 'Customer.id', 'Customer.firstName', 'Customer.lastName', 'Customer.phone'],
      order: [[sequelize.literal('callCount'), 'DESC']],
      limit
    });

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    List uploaded files for a call (SQL first, filesystem fallback)
// @route   GET /api/calls/:id/files
// @access  Private
exports.getCallFiles = async (req, res) => {
  try {
    const callId = req.params.id;
    // Try SQL via Sequelize
    try {
      const { CallAttachment } = require('../models');
      const rows = await CallAttachment.findAll({ where: { CallId: callId }, order: [['UploadedAt', 'DESC']] });
      if (rows && rows.length > 0) {
        res.set('X-Data-Source', 'db');
        return res.json(rows.map(r => ({ name: r.FileName, url: r.FilePath, type: r.Type })));
      }
    } catch (e) {
      console.error('DB read failed for CallAttachments, falling back to FS:', e.message);
    }

    // Fallback to filesystem
    const path = require('path');
    const fs = require('fs');
    const uploadsRoot = path.join(__dirname, '../uploads');
    const callDir = path.join(uploadsRoot, `call-${callId}`);
    if (!fs.existsSync(callDir)) {
      res.set('X-Data-Source', 'none');
      return res.json([]);
    }
    const files = fs.readdirSync(callDir)
      .filter(name => name !== 'status-history.json')
      .map(name => {
        const lower = name.toLowerCase();
        let type = 'document';
        if (lower.startsWith('medicine')) type = 'medicine';
        else if (lower.startsWith('prescription')) type = 'prescription';
        return { name, url: `/api/uploads/call-${callId}/${name}`, type };
      });
    res.set('X-Data-Source', 'fs');
    return res.json(files);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Get status history for a call (SQL first, filesystem fallback)
// @route   GET /api/calls/:id/history
// @access  Private
exports.getCallHistory = async (req, res) => {
  try {
    const callId = req.params.id;
    const call = await Call.findByPk(callId, {
      attributes: ['id', 'agentId', 'createdBy', 'updatedBy']
    });
    if (!call) {
      res.set('X-Data-Source', 'none');
      return res.json([]);
    }
    if (!(await canUserViewCall(call, req.user))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    // Try SQL via Sequelize
    try {
      const { CallStatusHistory } = require('../models');
      const rows = await CallStatusHistory.findAll({ where: { CallId: callId }, order: [['ChangedAt', 'DESC']] });
      if (rows && rows.length > 0) {
        res.set('X-Data-Source', 'db');
        return res.json(rows.map(r => ({
          previousStatus: r.PreviousStatus,
          newStatus: r.NewStatus,
          changedAt: r.ChangedAt,
          changedBy: r.ChangedBy
        })));
      }
    } catch (e) {
      console.error('DB read failed for CallStatusHistory, falling back to FS:', e.message);
    }

    // Fallback to filesystem
    const path = require('path');
    const fs = require('fs');
    const uploadsRoot = path.join(__dirname, '../uploads');
    const callDir = path.join(uploadsRoot, `call-${callId}`);
    const historyFile = path.join(callDir, 'status-history.json');
    if (!fs.existsSync(historyFile)) {
      res.set('X-Data-Source', 'none');
      return res.json([]);
    }
    const content = fs.readFileSync(historyFile, 'utf-8');
    const history = JSON.parse(content);
    res.set('X-Data-Source', 'fs');
    return res.json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Admin-only: Report data source used for files endpoint
// @route   GET /api/calls/:id/files/source
// @access  Private (Admin only)
exports.getCallFilesSource = async (req, res) => {
  try {
    const isAdmin = await hasAdminVisibility(req.user);
    if (!isAdmin) return res.status(403).json({ message: 'Forbidden' });

    const callId = req.params.id;
    try {
      const { CallAttachment } = require('../models');
      const rows = await CallAttachment.findAll({ where: { CallId: callId } });
      if (rows && rows.length > 0) {
        return res.json({ source: 'db', count: rows.length });
      }
    } catch (e) {
      console.error('DB read failed for CallAttachments (source check):', e.message);
    }

    const path = require('path');
    const fs = require('fs');
    const uploadsRoot = path.join(__dirname, '../uploads');
    const callDir = path.join(uploadsRoot, `call-${callId}`);
    if (!fs.existsSync(callDir)) return res.json({ source: 'none', count: 0 });
    const files = fs.readdirSync(callDir).filter(name => name !== 'status-history.json');
    return res.json({ source: 'fs', count: files.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Admin-only: Report data source used for history endpoint
// @route   GET /api/calls/:id/history/source
// @access  Private (Admin only)
exports.getCallHistorySource = async (req, res) => {
  try {
    const isAdmin = await hasAdminVisibility(req.user);
    if (!isAdmin) return res.status(403).json({ message: 'Forbidden' });

    const callId = req.params.id;
    try {
      const { CallStatusHistory } = require('../models');
      const rows = await CallStatusHistory.findAll({ where: { CallId: callId } });
      if (rows && rows.length > 0) {
        return res.json({ source: 'db', count: rows.length });
      }
    } catch (e) {
      console.error('DB read failed for CallStatusHistory (source check):', e.message);
    }

    const path = require('path');
    const fs = require('fs');
    const uploadsRoot = path.join(__dirname, '../uploads');
    const callDir = path.join(uploadsRoot, `call-${callId}`);
    const historyFile = path.join(callDir, 'status-history.json');
    if (!fs.existsSync(historyFile)) return res.json({ source: 'none', count: 0 });
    try {
      const content = fs.readFileSync(historyFile, 'utf-8');
      const history = JSON.parse(content);
      return res.json({ source: 'fs', count: Array.isArray(history) ? history.length : 0 });
    } catch (e) {
      return res.json({ source: 'fs', count: 0 });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

exports.getCustomerStatusHistory = async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    if (!customerId) {
      return res.status(400).json({ message: 'customerId is required' });
    }

    const replacements = { customerId };

    const rows = await sequelize.query(
      `
        SELECT
          h.Id AS historyId,
          h.CallId AS callId,
          h.PreviousStatus AS previousStatus,
          h.NewStatus AS newStatus,
          h.ChangedAt AS changedAt,
          h.ChangedBy AS changedBy,
          changer.firstName AS changedByFirstName,
          changer.lastName AS changedByLastName,
          c.callType AS callType,
          c.category AS category,
          c.orderId AS orderId,
          c.orderDetails AS orderDetails
        FROM dbo.CallStatusHistory h WITH (NOLOCK)
        INNER JOIN dbo.Calls c WITH (NOLOCK) ON c.id = h.CallId
        LEFT JOIN dbo.Users changer WITH (NOLOCK) ON changer.id = h.ChangedBy
        WHERE c.customerId = :customerId
          AND LOWER(ISNULL(c.callType, '')) NOT IN ('imp call upload', 'imp calls upload', 'order upload')
        ORDER BY h.ChangedAt DESC, h.Id DESC
      `,
      {
        raw: true,
        type: QueryTypes.SELECT,
        replacements
      }
    );

    return res.json({ data: rows });
  } catch (error) {
    console.error('getCustomerStatusHistory failed:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Get due follow-ups for the logged-in agent (or all for admin)
// @route   GET /api/calls/follow-ups/due
// @access  Private
exports.getDueFollowUps = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user is requesting all follow-ups (admin only)
    const { all } = req.query;
    let whereClause = {
      followUpRequired: true,
      followUpDate: {
        [Op.lte]: new Date() // Due by now or in past
      }
    };

    const isAdmin = req.user.role === 'Super Admin' || req.user.role === 'Admin' || req.user.role === 'admin';
    if (!all || !isAdmin) {
      whereClause.agentId = userId;
    }

    const followUps = await Call.findAll({
      where: whereClause,
      include: [
        { model: Customer, attributes: ['id', 'firstName', 'lastName', 'phone'] },
        { model: User, as: 'agent', attributes: ['firstName', 'lastName', 'email'] }
      ],
      order: [['followUpDate', 'ASC']],
      limit: 20
    });

    res.json(followUps);
  } catch (error) {
    console.error('Error fetching due follow-ups:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
