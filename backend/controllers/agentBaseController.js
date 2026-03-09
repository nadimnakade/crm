const { User, Role } = require('../models');
const AgentBase = require('../models/AgentBase');
const { Op } = require('sequelize');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

// Helper to parse dates from Excel (which might be numbers or strings)
const parseExcelDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    // Excel date serial number
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }
  // Try string parsing
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

exports.uploadAgentBase = async (req, res) => {
  try {
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
        const cleanKey = key.trim().toLowerCase();
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

    const records = [];
    for (const row of data) {
      // Map columns based on user provided headers (normalized keys)
      // "last order", "follow up", "number", "count of order", "name", "order", "payable", "agent name", "team"
      
      const rawAgentName = row['agent name'] || row['agent'] || '';
      const agentNameLower = String(rawAgentName).trim().toLowerCase();
      let agentId = userMap.get(agentNameLower) || null;

      // Clean up phone number (remove spaces, dashes)
      let phone = row['number'] || row['phone'] || row['customer phone'] || row['mobile'] || '';
      phone = String(phone).replace(/[^0-9]/g, '');

      records.push({
        agentId,
        lastOrderDate: parseExcelDate(row['last order'] || row['last order date'] || row['date']),
        followUpDate: parseExcelDate(row['follow up'] || row['follow up date']),
        customerPhone: phone.substring(0, 255), // Truncate to avoid varchar overflow
        orderCount: parseInt(row['count of order'] || row['order count'] || 0, 10),
        customerName: String(row['name'] || row['customer name'] || row['customer'] || '').substring(0, 255),
        orderId: String(row['order'] || row['order id'] || '').substring(0, 255),
        payableAmount: parseFloat(row['payable'] || row['payable amount'] || 0),
        agentName: String(rawAgentName || '').substring(0, 255),
        team: String(row['team'] || '').substring(0, 255)
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
