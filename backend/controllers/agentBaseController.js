const { User, Role } = require('../models');
const AgentBase = require('../models/AgentBase');
const { Op } = require('sequelize');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const normalizeKey = (k) =>
  String(k ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const parseExcelDate = (val) => {
  if (val === undefined || val === null || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') return new Date(Math.round((val - 25569) * 86400 * 1000));

  const s = String(val).replace(/\u00A0/g, ' ').trim();
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/;
  const dmyMatch = dmy.exec(s);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day, 0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  const ddMon = /^(\d{1,2})[\- ]([A-Za-z]{3,})[\- ](\d{2,4})$/;
  const ddMonMatch = ddMon.exec(s);
  if (ddMonMatch) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  const ddMonNoYear = /^(\d{1,2})[\- ]([A-Za-z]{3,})$/;
  const ddMonNoYearMatch = ddMonNoYear.exec(s);
  if (ddMonNoYearMatch) {
    const year = new Date().getFullYear();
    const d = new Date(`${s}-${year}`);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

exports.uploadAgentBase = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, { include: [Role] });
    const roleNameLower = (user?.Role?.name || '').toLowerCase();
    const isAdmin = ['admin', 'super admin', 'superadmin'].includes(roleNameLower);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Access denied: Only admins can upload Agent Base' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const workbook = xlsx.readFile(file.path, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    let data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Normalize headers: trim whitespace and lowercase keys for easier matching
    if (data.length > 0) {
      const firstRow = data[0];
      const foundHeaders = Object.keys(firstRow);
      console.log('Found headers in Excel:', foundHeaders);
    }

    data = data.map(row => {
      const newRow = {};
      Object.keys(row).forEach(key => {
        const cleanKey = normalizeKey(key);
        newRow[cleanKey] = row[key];
      });
      return newRow;
    });

    // Fetch all users to map names to IDs
    const users = await User.findAll({ attributes: ['id', 'firstName', 'lastName', 'username'] });
    const userMap = new Map();
    users.forEach(u => {
      const fullName = `${u.firstName} ${u.lastName}`.trim().toLowerCase();
      userMap.set(fullName, u.id);
      if (u.username) userMap.set(u.username.toLowerCase(), u.id);
    });

    const getValue = (row, keys) => {
      for (const key of keys) {
        if (row[key] !== undefined) return row[key];
      }
      return undefined;
    };

    const records = [];
    for (const row of data) {
      const rawAgentName = getValue(row, ['agent name', 'agent']) || '';
      const agentNameLower = String(rawAgentName).trim().toLowerCase();
      let agentId = userMap.get(agentNameLower) || null;

      let phone = getValue(row, ['number', 'phone', 'customer phone', 'mobile']) || '';
      phone = String(phone).replace(/[^0-9]/g, '');

      records.push({
        agentId,
        lastOrderDate: parseExcelDate(getValue(row, ['last order date', 'last order', 'date'])),
        followUpDate: parseExcelDate(getValue(row, ['follow up date', 'follow date', 'follow up', 'follow', 'followup date', 'followup'])),
        customerPhone: phone.substring(0, 255), // Truncate to avoid varchar overflow
        orderCount: parseInt(getValue(row, ['count of order', 'order count']) || 0, 10),
        customerName: String(getValue(row, ['name', 'customer name', 'customer']) || '').substring(0, 255),
        orderId: String(getValue(row, ['order id', 'order']) || '').substring(0, 255),
        payableAmount: parseFloat(getValue(row, ['payable amount', 'payable']) || 0),
        agentName: String(rawAgentName || '').substring(0, 255),
        team: String(getValue(row, ['team']) || '').substring(0, 255)
      });
    }

    if (records.length > 0) {
      // Validate records before insert
      const validRecords = records.map(r => ({
        ...r,
        // Ensure numeric fields are valid numbers or null
        orderCount: isNaN(r.orderCount) ? 0 : r.orderCount,
        payableAmount: isNaN(r.payableAmount) ? 0 : r.payableAmount,
        // Ensure dates are valid Date objects or null
        lastOrderDate: r.lastOrderDate instanceof Date && !isNaN(r.lastOrderDate) ? r.lastOrderDate : null,
        followUpDate: r.followUpDate instanceof Date && !isNaN(r.followUpDate) ? r.followUpDate : null
      }));

      await AgentBase.destroy({ where: {}, truncate: true });
      await AgentBase.bulkCreate(validRecords);
    } else {
      console.warn('No records to insert. Data length:', data.length);
      if (data.length > 0) {
        return res.status(400).json({ 
          message: 'No records processed. Please check column headers.', 
          foundHeaders: Object.keys(data[0])
        });
      }
    }

    // Cleanup file
    try { fs.unlinkSync(file.path); } catch(e) {}

    res.json({ message: 'Agent Base uploaded successfully', count: records.length });
  } catch (error) {
    console.error('Upload Agent Base failed:', error);
    res.status(500).json({ message: 'Failed to upload data', error: error.message });
  }
};

exports.getAgentBase = async (req, res) => {
  try {
    const { page = 1, pageSize = 20, search, export: isExport } = req.query;
    const offset = (page - 1) * pageSize;
    const limit = parseInt(pageSize, 10);

    // Hierarchy Logic
    const user = await User.findByPk(req.user.id, { include: [Role] });
    const roleName = user.Role ? user.Role.name : '';
    const roleNameLower = roleName.toLowerCase();
    
    // Check if Admin
    const isAdmin = ['admin', 'super admin', 'superadmin'].includes(roleNameLower);
    
    // Check if Manager (TL) - checks role name or if they manage anyone
    let isManager = ['manager', 'team leader', 'tl'].includes(roleNameLower);
    
    // Also check if they are a manager of anyone even if role name doesn't match
    if (!isAdmin && !isManager) {
      const managedCount = await User.count({ where: { managerId: user.id } });
      if (managedCount > 0) isManager = true;
    }

    const where = {};

    if (!isAdmin) {
      if (isManager) {
        // Manager sees their team + themselves
        const teamMembers = await User.findAll({
          where: { managerId: user.id },
          attributes: ['id']
        });
        const allowedIds = [user.id, ...teamMembers.map(u => u.id)];
        where.agentId = { [Op.in]: allowedIds };
      } else {
        // Agent sees only themselves
        where.agentId = user.id;
      }
    }

    // Search Logic
    if (search) {
      where[Op.or] = [
        { customerName: { [Op.like]: `%${search}%` } },
        { customerPhone: { [Op.like]: `%${search}%` } },
        { orderId: { [Op.like]: `%${search}%` } },
        { agentName: { [Op.like]: `%${search}%` } }
      ];
    }

    if (isExport === 'true') {
      // Export all matching records (ignoring pagination)
      const rows = await AgentBase.findAll({
        where,
        order: [['id', 'DESC']],
        raw: true
      });

      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(wb, ws, 'Agent Base');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', 'attachment; filename="AgentBase.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buf);
    }

    // Normal Pagination
    const { rows, count } = await AgentBase.findAndCountAll({
      where,
      limit,
      offset,
      order: [['id', 'DESC']],
      include: [
        { model: User, as: 'agent', attributes: ['firstName', 'lastName'] }
      ]
    });

    res.json({ rows, count, page, pageSize });

  } catch (error) {
    console.error('Get Agent Base failed:', error);
    res.status(500).json({ message: 'Failed to fetch Agent Base', error: error.message });
  }
};
