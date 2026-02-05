const { Call, Customer, User, Role, sequelize } = require('../models');
const { Op } = require('sequelize');

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
  const case1 = t === 'outbound' && c === 'sales-call' && mentionsFollowUp;
  const case2 = t === 'inbound' && c === 'new order related' && mentionsFollowUp;
  return case1 || case2;
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
    if (type) where.callType = type;
    if (customerId) where.customerId = customerId;
    if (orderId) where.orderId = { [Op.like]: `%${orderId}%` };
    if (hasOrderDetails) where.orderDetails = { [Op.ne]: null };
    if (hasRefundDetails) where.refundDetails = { [Op.ne]: null };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[Op.gte] = startDate;
      if (endDate) where.date[Op.lte] = endDate;
    }

    // Role-based visibility
    const visibility = await getVisibility(req.user);
    // if (visibility.scope === 'agent') {
    //   // Agents can only see their own calls; ignore requestedAgentId
    //   where.agentId = req.user.id;
    // } else if (visibility.scope === 'manager') {
    //   // Managers can filter by a specific agent within their team
    //   if (requestedAgentId && visibility.allowedAgentIds.includes(requestedAgentId)) {
    //     where.agentId = requestedAgentId;
    //   } else {
    //     where.agentId = { [Op.in]: visibility.allowedAgentIds };
    //   }
    // } else if (visibility.scope === 'admin') {
    //   if (requestedAgentId) {
    //     where.agentId = requestedAgentId;
    //   }
    // }

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
      where: searchTerm ? { [Op.and]: [where, { [Op.or]: callSearchWhere }] } : where,
      include: [
        customerWhere ? { model: Customer, where: customerWhere, required: true } : { model: Customer },
        { model: User, as: 'agent', attributes: ['id', 'firstName', 'lastName'] }
      ],
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

// @desc    Get active follow-ups
// @route   GET /api/calls/followups
// @access  Private
exports.getFollowUps = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const offset = (page - 1) * pageSize;
    const visibility = await getVisibility(req.user);

    const where = {
      followUpRequired: true,
      outcome: { [Op.notIn]: ['Order', 'Order Already Placed'] }
    };

    // Role-based filtering
    if (visibility.scope === 'agent') {
      where.agentId = req.user.id;
    } else if (visibility.scope === 'manager') {
       where.agentId = { [Op.in]: visibility.allowedAgentIds };
    }

    const { rows, count } = await Call.findAndCountAll({
      where,
      include: [
        { model: Customer },
        { model: User, as: 'agent', attributes: ['id', 'firstName', 'lastName'] }
      ],
      order: [['followUpDate', 'ASC']],
      limit: pageSize,
      offset
    });

    res.json({ data: rows, total: count, page, pageSize });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Update follow-up status (First Order Wins logic)
// @route   PUT /api/calls/:id/followup-status
// @access  Private
exports.updateFollowUpStatus = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { status, reason, comments } = req.body;
    const agentId = req.user.id;

    const call = await Call.findByPk(id, { include: [Customer], transaction });
    if (!call) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Call not found' });
    }

    // Update current call
    call.outcome = status;
    call.reason = reason;
    if (comments) {
      call.notes = (call.notes ? call.notes + '\n' : '') + `[${new Date().toISOString()}] ${comments}`;
    }
    // If handled, maybe set followUpRequired to false? 
    // User didn't specify, but usually "Order", "Not Interested" etc means follow-up is done.
    if (['Order', 'Order Already Placed', 'Not Interested', 'Not Required'].includes(status)) {
        call.followUpRequired = false;
    }
    
    await call.save({ transaction });

    // Critical Logic: First Order Wins
    if (status === 'Order') {
      const customerPhone = call.Customer.phone;
      
      // Find other active follow-ups for this phone number
      // We need to find calls linked to ANY customer with this phone number (in case of duplicates)
      // But simpler is to find calls linked to customers with same phone
      const customersWithSamePhone = await Customer.findAll({
        where: { phone: customerPhone },
        attributes: ['id'],
        transaction
      });
      const customerIds = customersWithSamePhone.map(c => c.id);

      // Update other follow-ups
      await Call.update(
        { 
          outcome: 'Order Already Placed',
          reason: 'Order placed by another agent',
          followUpRequired: false
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
        { model: User, as: 'agent', attributes: ['id', 'firstName', 'lastName'] }
      ]
    });

    if (call) {
      res.json(call);
    } else {
      res.status(404).json({ message: 'Call not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Create a call
// @route   POST /api/calls
// @access  Private
exports.createCall = async (req, res) => {
  try {
    const {
      customerId,
      agentId,
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
    } catch {}
    if (sanitizedOrderDetails && typeof sanitizedOrderDetails === 'object') {
      const keys = Array.isArray(sanitizedOrderDetails)
        ? sanitizedOrderDetails.length
        : Object.keys(sanitizedOrderDetails).length;
      if (keys === 0) sanitizedOrderDetails = null;
    }

    // Validate follow-up requirements
    const mustHaveFollowUpDate = requiresFollowUpDate(callType, category, outcome);
    if (mustHaveFollowUpDate && !followUpDate) {
      return res.status(422).json({
        message: 'Follow-up date is required for this interaction',
        rule: 'outbound > sales-call > followup OR inbound > new order related > follow-up scheduled'
      });
    }

    const call = await Call.create({
      customerId,
      agentId: agentId || (req.user ? req.user.id : null),
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
      followUpDate: followUpDate || null
    });

    res.status(201).json(call);
  } catch (error) {
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
    } catch {}
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

    await call.save();

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
    res.json(call);
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

  // Managers by name or roleId (3)
  if (roleNameLower === 'manager' || roleId === 3) {
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
    const start = new Date(base); start.setHours(0,0,0,0);
    const end = new Date(base); end.setHours(23,59,59,999);
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
        { [Op.or]: [
          // Allow any call that has non-empty structured orderDetails
          sequelize.literal("orderDetails IS NOT NULL AND LEN(orderDetails) > 2"),
          // Allow orderId-only calls except FollowUp outcomes
          { [Op.and]: [
            { orderId: { [Op.ne]: null } },
            { outcome: { [Op.notIn]: ['No', 'follow-up-scheduled'] } }
          ] }
        ] }
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
    const allowedSort = ['createdAt','date','orderId'];
    const order = allowedSort.includes(sortBy) ? [[sortBy, sortOrder]] : [['createdAt','DESC']];

    const include = [
      // Customer include with optional search
      (req._searchTerm ? { model: Customer, where: {
        [Op.or]: [
          { firstName: { [Op.like]: `%${req._searchTerm}%` } },
          { lastName: { [Op.like]: `%${req._searchTerm}%` } },
          ...(req._searchDigits && req._searchDigits.length >= 5 ? [{ phone: { [Op.like]: `%${req._searchDigits}%` } }] : [])
        ]
      }, required: false } : { model: Customer }),
      { model: User, as: 'agent', attributes: ['id','firstName','lastName'] }
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
      orderDetails: typeof r.orderDetails === 'string' ? (function(){ try { return JSON.parse(r.orderDetails); } catch { return null; } })() : r.orderDetails
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
    const start = new Date(base); start.setHours(0,0,0,0);
    const end = new Date(base); end.setHours(23,59,59,999);
    const requestedAgentId = req.query.agentId ? parseInt(req.query.agentId, 10) : null;

    const visibility = await getVisibility(req.user);
    const applyDateFilter = !!dateStr || visibility.scope !== 'admin';
    const where = {
      [Op.and]: [
        // Leverage persisted computed column + index for fast counts
        sequelize.where(sequelize.col('HasOrder'), 1),
        // Count only non-empty orderDetails or orderId-only excluding FollowUp outcomes
        { [Op.or]: [
          sequelize.literal("orderDetails IS NOT NULL AND LEN(orderDetails) > 2"),
          { [Op.and]: [
            { orderId: { [Op.ne]: null } },
            { outcome: { [Op.notIn]: ['No', 'follow-up-scheduled'] } }
          ] }
        ] },
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
    // If not provided, default to TODAY ONLY
    // IMPORTANT: Parse dates in LOCAL time to avoid UTC shift with 'YYYY-MM-DD'
    const parseLocalYMD = (s) => {
      if (!s) return null;
      const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
      if (!m) return null;
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const d = parseInt(m[3], 10);
      return new Date(y, mo, d, 0, 0, 0, 0); // local midnight
    };
    const fromStr = (req.query.from || '').toString().trim();
    const toStr = (req.query.to || '').toString().trim();
    const today = new Date();
    let start = parseLocalYMD(fromStr) || new Date(today);
    let end = parseLocalYMD(toStr) || new Date(start);
    // Normalize to full-day bounds (local) and use half-open range [start, nextDayStart)
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const endExclusive = new Date(end.getTime());
    endExclusive.setDate(endExclusive.getDate() + 1);

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const sortBy = (req.query.sortBy || 'followUpDate').toString();
    const sortOrder = ((req.query.sortOrder || 'ASC').toString().toUpperCase() === 'DESC') ? 'DESC' : 'ASC';
    const requestedAgentId = req.query.agentId ? parseInt(req.query.agentId, 10) : null;

    const visibility = await getVisibility(req.user);
    const applyDateFilter = !!fromStr || !!toStr || visibility.scope !== 'admin';
    // Include any interaction that has a follow-up scheduled in range,
    // regardless of whether an orderId or orderDetails exist.
    // Date logic:
    // - With orderId: filter by followUpDate within range
    // - Without orderId: filter by followUpDate within range (per user request)
    const dateFilter = applyDateFilter ? { followUpDate: { [Op.gte]: start, [Op.lt]: endExclusive } } : {};

    // Strict scenarios allowed:
    // 1) Inbound > New order related > follow-up-scheduled
    // 2) Outbound > Sales Call > FollowUp (stored as outcome 'No')
    const inboundFollowScheduled = [
      sequelize.where(sequelize.fn('LOWER', sequelize.col('callType')), 'inbound'),
      sequelize.where(sequelize.fn('LOWER', sequelize.col('category')), { [Op.in]: ['new order related','new-order-related','new_order_related'] }),
      sequelize.where(sequelize.fn('LOWER', sequelize.col('outcome')), 'follow-up-scheduled')
    ];
    const outboundSalesFollowup = [
      sequelize.where(sequelize.fn('LOWER', sequelize.col('callType')), 'outbound'),
      sequelize.where(sequelize.fn('LOWER', sequelize.col('category')), { [Op.in]: ['sales-call','sales call','sales_call'] }),
      sequelize.where(sequelize.fn('LOWER', sequelize.col('outcome')), 'no')
    ];

    const where = {
      [Op.and]: [
        {
          [Op.or]: [
            // With order id: use followUpDate range and match ONLY inbound scheduled scenario
            { [Op.and]: [ { orderId: { [Op.ne]: null } }, dateFilter, ...inboundFollowScheduled ] },
            // Without order id: use followUpDate range and match ONLY outbound followup scenario
            { [Op.and]: [ { orderId: { [Op.eq]: null } }, dateFilter, ...outboundSalesFollowup ] }
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
      offset
    });

    const data = rows.map(r => ({
      id: r.id,
      createdAt: r.createdAt,
      followUpDate: r.followUpDate,
      agent: r.agent,
      customer: r.Customer,
      orderId: r.orderId,
      orderDetails: typeof r.orderDetails === 'string' ? (function(){ try { return JSON.parse(r.orderDetails); } catch { return null; } })() : r.orderDetails
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
        { model: Customer, attributes: ['name', 'mobile'] },
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