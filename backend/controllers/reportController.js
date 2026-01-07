const xlsx = require('xlsx');
const { sequelize, Call, User, Role } = require('../models');
const { QueryTypes, Op } = require('sequelize');
// IST helpers and formatting
const IST_OFFSET_MINUTES = 5 * 60 + 30; // +05:30
const pad2 = (n) => String(n).padStart(2, '0');
function istTodayDateStr() {
  const nowUTC = new Date();
  const istMs = nowUTC.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
  const ist = new Date(istMs);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + 1;
  const d = ist.getUTCDate();
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
function istStartUTCForDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const istMidnightUTC = Date.UTC(y, m - 1, d, 0, 0, 0);
  const utcMs = istMidnightUTC - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs);
}
function istEndExclusiveUTCForDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const istNextMidnightUTC = Date.UTC(y, m - 1, d + 1, 0, 0, 0);
  const utcMs = istNextMidnightUTC - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs);
}
function getISTRange(fromStr, toStr) {
  const useToday = !fromStr && !toStr;
  const startStr = (fromStr || '').trim() || istTodayDateStr();
  const endStr = (toStr || '').trim() || startStr;
  return {
    start: istStartUTCForDateStr(startStr),
    endExclusive: istEndExclusiveUTCForDateStr(endStr)
  };
}

// Helper to format local date-time as 'YYYY-MM-DD HH:mm:ss'
function formatLocalDateTime(dt) {
  if (!dt) return null;
  const utc = new Date(dt);
  const istMs = utc.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
  const d = new Date(istMs);
  const yyyy = d.getUTCFullYear();
  const mm = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  const hh = pad2(d.getUTCHours());
  const mi = pad2(d.getUTCMinutes());
  const ss = pad2(d.getUTCSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

// Export customer-wise interactions (Calls + latest status) as Excel or CSV
// GET /api/reports/interactions/export?from=YYYY-MM-DD&to=YYYY-MM-DD&customerId=&agentId=&limit=&format=xlsx|csv
exports.exportInteractions = async (req, res) => {
  try {
    try { req.setTimeout(300000); } catch {}
    try { res.setTimeout(300000); } catch {}

    const { from, to, customerId, agentId } = req.query || {};
    const limit = parseInt(req.query.limit, 10) || 10000;
    const format = (req.query.format || 'xlsx').toLowerCase();

    const fromDateUTC = from ? istStartUTCForDateStr(from) : null;
    const toDateExclusiveUTC = to ? istEndExclusiveUTCForDateStr(to) : null;

    const sql = `
      SELECT TOP (:limit)
       
        c.[date] AS CallDate,
        c.duration,
        c.callType,
        c.category,
        c.outcome,
        c.notes,
        c.followUpRequired,
        c.followUpDate,
        c.createdAt,
        c.updatedAt,
        cust.firstName,
        cust.lastName,
        cust.phone,
        cust.address,
        agent.firstName AS agentFirstName,
        agent.lastName AS agentLastName,
        agent.email AS agentEmail
      FROM dbo.Calls c WITH (NOLOCK)
      LEFT JOIN dbo.Customers cust WITH (NOLOCK) ON cust.id = c.customerId
      LEFT JOIN dbo.Users agent WITH (NOLOCK) ON agent.id = c.agentId
      WHERE (:customerId IS NULL OR c.customerId = :customerId)
        AND (:agentId IS NULL OR c.agentId = :agentId)
        AND (:fromDateUTC IS NULL OR c.[createdAt] >= :fromDateUTC)
        AND (:toDateExclusiveUTC IS NULL OR c.[createdAt] < :toDateExclusiveUTC)
      ORDER BY c.[createdAt] DESC, c.Id DESC
      OPTION (RECOMPILE);
    `;

    const [rows] = await sequelize.query(sql, {
      raw: true,
      replacements: {
        customerId: customerId ? parseInt(customerId, 10) : null,
        agentId: agentId ? parseInt(agentId, 10) : null,
        fromDateUTC,
        toDateExclusiveUTC,
        limit
      }
    });

    // Interaction report: only interaction columns, no order/refund details
    const headers = [
      'CustomerName','Phone','Address','AgentName','AgentEmail','CallDate','Duration','CallType','Category','Outcome','Notes','FollowUpRequired','FollowUpDate','CreatedAt','UpdatedAt'
    ];

    const data = (rows || []).map(r => ({
     
      CustomerName: [r.firstName, r.lastName].filter(Boolean).join(' ').trim(),
      Phone: r.phone,
      Address: r.address,
     
      AgentName: [r.agentFirstName, r.agentLastName].filter(Boolean).join(' ').trim(),
      AgentEmail: r.agentEmail,
      CallDate: r.CallDate ? new Date(r.CallDate) : null,
      Duration: r.duration,
      CallType: r.callType,
      Category: r.category,
      Outcome: r.outcome,
      Notes: r.notes,
      FollowUpRequired: r.followUpRequired ? 1 : 0,
      FollowUpDate: r.followUpDate ? new Date(r.followUpDate) : null,
      CreatedAt: r.createdAt ? new Date(r.createdAt) : null,
      UpdatedAt: r.updatedAt ? new Date(r.updatedAt) : null
    }));

    if (format === 'csv') {
      const ws = xlsx.utils.json_to_sheet(data, { header: headers });
      const csv = xlsx.utils.sheet_to_csv(ws);
      const buf = Buffer.from(csv, 'utf8');
      res.setHeader('Content-Disposition', 'attachment; filename="customer-interactions.csv"');
      res.setHeader('Content-Type', 'text/csv');
      return res.send(buf);
    } else {
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(data, { header: headers });
      xlsx.utils.book_append_sheet(wb, ws, 'Interactions');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', 'attachment; filename="customer-interactions.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buf);
    }
  } catch (error) {
    console.error('Interactions export failed:', error);
    res.status(500).json({ message: 'Failed to export interactions', error: error.message });
  }
};

// Export order-only details as Excel or CSV
exports.exportOrders = async (req, res) => {
  try {
    try { req.setTimeout(300000); } catch {}    

    const { from, to } = req.query || {};
    const limit = parseInt(req.query.limit, 10) || 10000;
    const format = (req.query.format || 'xlsx').toLowerCase();

    const fromDateUTC = from ? istStartUTCForDateStr(from) : null;
    const toDateExclusiveUTC = to ? istEndExclusiveUTCForDateStr(to) : null;

    const sql = `
      SELECT TOP (:limit)
        c.orderId,
        c.orderDetails,
        c.[date] AS CallDate,
        c.createdAt,
        c.followUpDate,
        agent.firstName AS agentFirstName,
        agent.lastName AS agentLastName
      FROM dbo.Calls c WITH (NOLOCK)
      LEFT JOIN dbo.Users agent WITH (NOLOCK) ON agent.id = c.agentId
      WHERE c.orderDetails IS NOT NULL
        AND (:fromDateUTC IS NULL OR c.[createdAt] >= :fromDateUTC)
        AND (:toDateExclusiveUTC IS NULL OR c.[createdAt] < :toDateExclusiveUTC)
      ORDER BY c.[createdAt] DESC, c.Id DESC
      OPTION (RECOMPILE);
    `;

    const [rows] = await sequelize.query(sql, {
      raw: true,
      replacements: { fromDateUTC, toDateExclusiveUTC, limit }
    });

    // Targeted columns from orderDetails JSON + createdOn + agentName
    const headers = [
      'OrderId',
      'CustomerName',
      'CustomerMobileNo',
      'MRP',
      'Pay',
      'Alternate',
      'FollowupDate',
      'AgentName',
      'CreatedOn'
    ];

    const data = (rows || []).map(r => {
      const od = typeof r.orderDetails === 'string'
        ? (() => { try { return JSON.parse(r.orderDetails); } catch { return null; } })()
        : r.orderDetails;

      const row = {
        OrderId: (od && od.orderId) ?? r.orderId ?? null,
        CustomerName: od?.customerName ?? null,
        CustomerMobileNo: od?.customerMobileNo ?? null,
        MRP: (od && (od.mrp ?? od.MRP)) ?? null,
        Pay: (od && (od.pay ?? od.Pay)) ?? null,
        Alternate: od?.alternate ?? null,
        FollowupDate: (od && od.followupDate) ? new Date(od.followupDate) : null,
        AgentName: [r.agentFirstName, r.agentLastName].filter(Boolean).join(' ').trim() || null,
        CreatedOn: r.createdAt ? formatLocalDateTime(r.createdAt) : null
      };

      return row;
    });

    if (format === 'csv') {
      const ws = xlsx.utils.json_to_sheet(data, { header: headers });
      const csv = xlsx.utils.sheet_to_csv(ws);
      const buf = Buffer.from(csv, 'utf8');
      res.setHeader('Content-Disposition', 'attachment; filename="orders-detail.csv"');
      res.setHeader('Content-Type', 'text/csv');
      return res.send(buf);
    } else {
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(data, { header: headers });
      xlsx.utils.book_append_sheet(wb, ws, 'Orders');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', 'attachment; filename="orders-detail.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buf);
    }
  } catch (error) {
    console.error('Orders export failed:', error);
    res.status(500).json({ message: 'Failed to export orders', error: error.message });
  }
};

// Export followup orders (calls with orderDetails and a followUpDate within range)
// GET /api/reports/followups/export?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=&format=xlsx|csv
exports.exportFollowups = async (req, res) => {
  try {
    try { req.setTimeout(300000); } catch {}    

    const { from, to } = req.query || {};
    const limit = parseInt(req.query.limit, 10) || 10000;
    const format = (req.query.format || 'xlsx').toLowerCase();

    let fromDateUTC;
    let toDateExclusiveUTC;

    if (from || to) {
      if (from && to) {
        fromDateUTC        = istStartUTCForDateStr(from);
        toDateExclusiveUTC = istEndExclusiveUTCForDateStr(to);
      } else if (from && !to) {
        fromDateUTC        = istStartUTCForDateStr(from);
        toDateExclusiveUTC = istEndExclusiveUTCForDateStr(from); // same day
      } else { // !from && to
        fromDateUTC        = istStartUTCForDateStr(to);
        toDateExclusiveUTC = istEndExclusiveUTCForDateStr(to);
      }
    } else {
      const { start, endExclusive } = getISTRange(null, null); // today in IST
      fromDateUTC        = start;
      toDateExclusiveUTC = endExclusive;
    }

    const rows = await sequelize.query(
      'EXEC dbo.ExportFollowups ' +
        '@FromDateUTC = :fromDateUTC, ' +
        '@ToDateExclusiveUTC = :toDateExclusiveUTC, ' +
        '@Limit = :limit',
      {
        raw: true,
        type: QueryTypes.SELECT,
        replacements: {
          fromDateUTC,
          toDateExclusiveUTC,
          limit
        }
      }
    );

    const headers = [
      'FollowupDate',
      'OrderId',
      'CustomerName',
      'CustomerMobileNo',
      'MRP',
      'Pay',
      'Alternate',
      'AgentName',
      'CreatedOn'
    ];

    const data = (rows || []).map(r => {
      const od = typeof r.orderDetails === 'string'
        ? (() => { try { return JSON.parse(r.orderDetails); } catch { return null; } })()
        : r.orderDetails;

      return {
        FollowupDate: r.followUpDate ? formatLocalDateTime(r.followUpDate) : null,
        OrderId: (od && od.orderId) ?? r.orderId ?? null,
        CustomerName: od?.customerName ?? null,
        CustomerMobileNo: od?.customerMobileNo ?? null,
        MRP: (od && (od.mrp ?? od.MRP)) ?? null,
        Pay: (od && (od.pay ?? od.Pay)) ?? null,
        Alternate: od?.alternate ?? null,
        AgentName: [r.agentFirstName, r.agentLastName].filter(Boolean).join(' ').trim() || null,
        CreatedOn: r.createdAt ? formatLocalDateTime(r.createdAt) : null
      };
    });

    if (format === 'csv') {
      const ws = xlsx.utils.json_to_sheet(data, { header: headers });
      const csv = xlsx.utils.sheet_to_csv(ws);
      const buf = Buffer.from(csv, 'utf8');
      res.setHeader('Content-Disposition', 'attachment; filename="followups.csv"');
      res.setHeader('Content-Type', 'text/csv');
      return res.send(buf);
    } else {
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(data, { header: headers });
      xlsx.utils.book_append_sheet(wb, ws, 'Followups');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', 'attachment; filename="followups.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buf);
    }
  } catch (error) {
    console.error('Followups export failed:', error);
    res.status(500).json({ message: 'Failed to export followups', error: error.message });
  }
};


// @desc    Get Top 10 Daily Agents by Orders
// @route   GET /api/reports/top-agents
// @access  Private
exports.getTopAgents = async (req, res) => {
  try {
    const today = istTodayDateStr();
    const { start, endExclusive } = getISTRange(today, today);

    const results = await Call.findAll({
      attributes: [
        'agentId',
        [sequelize.fn('COUNT', sequelize.col('orderId')), 'orderCount']
      ],
      where: {
        createdAt: {
          [Op.gte]: start,
          [Op.lt]: endExclusive
        },
        orderId: {
          [Op.ne]: null
        }
      },
      include: [{
        model: User,
        as: 'agent',
        attributes: ['firstName', 'lastName']
      }],
      group: ['agentId', 'agent.id', 'agent.firstName', 'agent.lastName'],
      order: [[sequelize.literal('orderCount'), 'DESC']],
      limit: 10
    });

    const formattedResults = results.map(r => ({
      agentName: r.agent ? `${r.agent.firstName} ${r.agent.lastName}`.trim() : 'Unknown',
      orderCount: r.dataValues.orderCount
    }));

    res.json(formattedResults);
  } catch (error) {
    console.error('Error in getTopAgents:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get Active User Report (Last Login)
// @route   GET /api/reports/active-users
// @access  Private
exports.getActiveUsers = async (req, res) => {
  try {
    // Admin sees all (currently implemented for all roles as requested "Hierarchy wise admin wil see all", assuming other roles might be restricted later but for now open)
    // If restriction is needed, check req.user.role
    
    const users = await User.findAll({
      attributes: ['id', 'firstName', 'lastName', 'lastLogin'],
      include: [{
        model: Role,
        attributes: ['name']
      }],
      where: {
        isActive: true
      },
      order: [['lastLogin', 'DESC']]
    });
    
    const formattedUsers = users.map(u => ({
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.Role ? u.Role.name : 'Unknown',
      lastLogin: u.lastLogin
    }));
    
    // Format dates for response if needed, but frontend can handle ISO strings
    res.json(formattedUsers);
  } catch (error) {
    console.error('Error in getActiveUsers:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get Weekly Order Stats (Last 7 Days)
// @route   GET /api/reports/weekly-orders
// @access  Private
exports.getWeeklyOrderStats = async (req, res) => {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6); // Last 7 days including today
    start.setHours(0, 0, 0, 0);

    const results = await Call.findAll({
      attributes: [
        [sequelize.literal("CAST(createdAt AS DATE)"), 'date'],
        [sequelize.fn('COUNT', sequelize.col('orderId')), 'count']
      ],
      where: {
        createdAt: {
          [Op.gte]: start
        },
        orderId: {
          [Op.ne]: null
        }
      },
      group: [sequelize.literal("CAST(createdAt AS DATE)")],
      order: [[sequelize.literal("CAST(createdAt AS DATE)"), 'ASC']]
    });

    res.json(results);
  } catch (error) {
    console.error('Error in getWeeklyOrderStats:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get Call Outcome Stats (Today)
// @route   GET /api/reports/call-outcomes
// @access  Private
exports.getCallOutcomeStats = async (req, res) => {
  try {
    const today = istTodayDateStr();
    const { start, endExclusive } = getISTRange(today, today);

    const results = await Call.findAll({
      attributes: [
        'outcome',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        createdAt: {
          [Op.gte]: start,
          [Op.lt]: endExclusive
        }
      },
      group: ['outcome'],
      order: [[sequelize.literal('count'), 'DESC']]
    });

    res.json(results);
  } catch (error) {
    console.error('Error in getCallOutcomeStats:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
