const xlsx = require('xlsx');
const { sequelize } = require('../models');

// Export customer-wise interactions (Calls + latest status) as Excel or CSV
// GET /api/reports/interactions/export?from=YYYY-MM-DD&to=YYYY-MM-DD&customerId=&agentId=&limit=&format=xlsx|csv
exports.exportInteractions = async (req, res) => {
  try {
    try { req.setTimeout(300000); } catch {}
    try { res.setTimeout(300000); } catch {}

    const { from, to, customerId, agentId } = req.query || {};
    const limit = parseInt(req.query.limit, 10) || 10000;
    const format = (req.query.format || 'xlsx').toLowerCase();

    const fromDate = from ? new Date(from) : null;
    let toDate = null;
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      toDate = end;
    }

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
        AND (:fromDate IS NULL OR c.[date] >= :fromDate)
        AND (:toDate IS NULL OR c.[date] <= :toDate)
      ORDER BY c.[date] DESC, c.Id DESC
      OPTION (RECOMPILE);
    `;

    const [rows] = await sequelize.query(sql, {
      raw: true,
      replacements: {
        customerId: customerId ? parseInt(customerId, 10) : null,
        agentId: agentId ? parseInt(agentId, 10) : null,
        fromDate,
        toDate,
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
    try { res.setTimeout(300000); } catch {}

    const { from, to } = req.query || {};
    const limit = parseInt(req.query.limit, 10) || 10000;
    const format = (req.query.format || 'xlsx').toLowerCase();

    const fromDate = from ? new Date(from) : null;
    let toDate = null;
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      toDate = end;
    }

    const sql = `
      SELECT TOP (:limit)
        c.orderId,
        c.orderDetails,
        c.[date] AS CallDate
      FROM dbo.Calls c WITH (NOLOCK)
      WHERE (c.orderDetails IS NOT NULL OR c.orderId IS NOT NULL)
        OR (:fromDate IS NULL OR c.[date] >= :fromDate)
        OR (:toDate IS NULL OR c.[date] <= :toDate)
      ORDER BY c.[date] DESC, c.Id DESC
      OPTION (RECOMPILE);
    `;

    const [rows] = await sequelize.query(sql, {
      raw: true,
      replacements: { fromDate, toDate, limit }
    });

    // Flatten orderDetails only
    function flattenObject(obj, prefix = '') {
      const out = {};
      if (!obj || typeof obj !== 'object') return out;
      const isArray = Array.isArray(obj);
      const entries = isArray ? obj.entries() : Object.entries(obj);
      for (const [k, v] of entries) {
        const key = isArray ? `${prefix}${k}` : `${prefix}${k}`;
        if (v && typeof v === 'object') {
          Object.assign(out, flattenObject(v, `${key}.`));
        } else {
          out[key] = v;
        }
      }
      return out;
    }

    const orderKeysSet = new Set();
    for (const r of rows || []) {
      const od = typeof r.orderDetails === 'string' ? (() => { try { return JSON.parse(r.orderDetails); } catch { return null; } })() : r.orderDetails;
      const odFlat = flattenObject(od, 'Order');
      Object.keys(odFlat).forEach(k => orderKeysSet.add(k));
    }

    const dynamicOrderHeaders = Array.from(orderKeysSet).sort();
    const headers = ['OrderId', ...dynamicOrderHeaders];

    const data = (rows || []).map(r => {
      const od = typeof r.orderDetails === 'string' ? (() => { try { return JSON.parse(r.orderDetails); } catch { return null; } })() : r.orderDetails;
      const odFlat = flattenObject(od, 'Order');
      const row = { OrderId: r.orderId || null };
      for (const k of dynamicOrderHeaders) {
        const val = odFlat[k];
        row[k] = (val && typeof val === 'object') ? JSON.stringify(val) : val ?? null;
      }
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