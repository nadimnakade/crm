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
        c.customerId,
        c.[date] AS CallDate,
        c.duration,
        c.callType,
        c.category,
        c.outcome,
        c.notes,
        c.followUpRequired,
        c.followUpDate,
        cust.firstName,
        cust.lastName,
        cust.phone,
        cust.address,
        agent.firstName AS agentFirstName,
        agent.lastName AS agentLastName
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

    const headers = [
      'CustomerId','CustomerName','Phone','Address','AgentName','CallDate','Duration','CallType','Category','Outcome','Notes','FollowUpRequired','FollowUpDate'
    ];
    const data = (rows || []).map(r => ({
      CustomerId: r.customerId,
      CustomerName: [r.firstName, r.lastName].filter(Boolean).join(' ').trim(),
      Phone: r.phone,
      Address: r.address,
      AgentName: [r.agentFirstName, r.agentLastName].filter(Boolean).join(' ').trim(),
      CallDate: r.CallDate ? new Date(r.CallDate) : null,
      Duration: r.duration,
      CallType: r.callType,
      Category: r.category,
      Outcome: r.outcome,
      Notes: r.notes,
      FollowUpRequired: r.followUpRequired ? 1 : 0,
      FollowUpDate: r.followUpDate ? new Date(r.followUpDate) : null
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