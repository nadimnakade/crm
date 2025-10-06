const { Call, Customer, User, Role, sequelize } = require('../models');
const { Op } = require('sequelize');

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
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    const sortBy = (req.query.sortBy || 'createdAt').toString();
    const sortOrder = ((req.query.sortOrder || 'DESC').toString().toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

    const where = {};
    if (status) where.outcome = status; // map UI status to outcome
    if (type) where.callType = type;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[Op.gte] = startDate;
      if (endDate) where.date[Op.lte] = endDate;
    }

    let customerWhere = undefined;
    const callSearchWhere = [];
    if (searchTerm) {
      // Search across call fields
      callSearchWhere.push(
        { notes: { [Op.like]: `%${searchTerm}%` } },
        { outcome: { [Op.like]: `%${searchTerm}%` } }
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
      date,
      duration,
      notes,
      outcome,
      followUpRequired,
      followUpDate
    } = req.body;

    const call = await Call.create({
      customerId,
      agentId: agentId || (req.user ? req.user.id : null),
      callType,
      date,
      duration,
      notes,
      outcome,
      followUpRequired,
      followUpDate
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
      date,
      duration,
      notes,
      outcome,
      followUpRequired,
      followUpDate
    } = req.body;

    const previousOutcome = call.outcome;
    // Update call fields
    if (customerId) call.customerId = customerId;
    if (agentId) call.agentId = agentId;
    if (callType) call.callType = callType;
    if (date) call.date = date;
    if (duration !== undefined) call.duration = duration;
    if (notes !== undefined) call.notes = notes;
    if (outcome) call.outcome = outcome;
    if (followUpRequired !== undefined) call.followUpRequired = followUpRequired;
    if (followUpDate !== undefined) call.followUpDate = followUpDate;

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

// Helper to determine if the requester has admin-level visibility
const hasAdminVisibility = async (user) => {
  try {
    if (!user) return false;
    const role = await Role.findByPk(user.roleId);
    const adminNames = ['SuperAdmin', 'Super Admin', 'Admin', 'Manager'];
    return !!role && adminNames.includes(role.name);
  } catch {
    return false;
  }
};

// @desc    Get recent calls (role-based visibility)
// @route   GET /api/calls/recent
// @access  Private
exports.getRecentCalls = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const isAdmin = await hasAdminVisibility(req.user);
    const where = isAdmin ? {} : { agentId: req.user.id };

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

    const isAdmin = await hasAdminVisibility(req.user);
    const where = {
      date: { [Op.between]: [start, end] }
    };
    if (!isAdmin) where.agentId = req.user.id;

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

    const isAdmin = await hasAdminVisibility(req.user);
    const where = {
      date: { [Op.between]: [start, end] }
    };
    if (!isAdmin) where.agentId = req.user.id;

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