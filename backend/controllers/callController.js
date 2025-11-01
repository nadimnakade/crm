const { Call, Customer, User, Role, sequelize } = require('../models');
const { Op } = require('sequelize');

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
      // Search customer name
      customerWhere = {
        [Op.or]: [
          { firstName: { [Op.like]: `%${searchTerm}%` } },
          { lastName: { [Op.like]: `%${searchTerm}%` } }
        ]
      };
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
    res.status(500).json({ message: 'Server error' });
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
    res.status(500).json({ message: 'Server error' });
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
      orderDetails,
      refundDetails,
      followUpRequired: mustHaveFollowUpDate ? true : !!followUpRequired,
      followUpDate: followUpDate || null
    });

    res.status(201).json(call);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
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
    if (orderDetails !== undefined) call.orderDetails = orderDetails;
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
    res.status(500).json({ message: 'Server error' });
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
    res.status(500).json({ message: 'Server error' });
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
  const roleName = await getRoleName(user);
  if (!roleName) return { scope: 'agent', allowedAgentIds: [user?.id].filter(Boolean) };
  if (['SuperAdmin', 'Super Admin', 'Admin'].includes(roleName)) {
    return { scope: 'admin' };
  }
  if (roleName === 'Manager') {
    const teamIds = await getManagedAgentIds(user.id);
    return { scope: 'manager', allowedAgentIds: [...teamIds, user.id] };
  }
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
    res.status(500).json({ message: 'Server error' });
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
    res.status(500).json({ message: 'Server error' });
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
    res.status(500).json({ message: 'Server error' });
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
    res.status(500).json({ message: 'Server error' });
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
    res.status(500).json({ message: 'Server error' });
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
    res.status(500).json({ message: 'Server error' });
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
    res.status(500).json({ message: 'Server error' });
  }
};