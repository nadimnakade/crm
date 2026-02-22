const path = require('path');
const xlsx = require('xlsx');
const fs = require('fs');
const { Call, Customer, User, Role, sequelize, CallStatusHistory } = require('../models');
const { Op } = require('sequelize');

// Expected headers for bulk upload (case-insensitive match)
// User requirements: Date, Customer, Phone, Alternate, Order ID, Order Type, Amount, Status, Agent
const REQUIRED_HEADERS = [
  'Date',
  'Customer',
  'Phone',
  'Alternate',
  'Order ID',
  'Order Type',
  'Amount',
  'Status',
  'Agent'
];

// Helper: build case-insensitive index map from header row
function buildHeaderIndex(headerRow) {
  const map = {};
  headerRow.forEach((h, idx) => {
    if (h !== undefined && h !== null) {
      map[String(h).trim().toLowerCase()] = idx;
    }
  });
  return map;
}

// Upload handler for Orders bulk Excel/CSV
// @route POST /api/orders/upload
exports.uploadOrders = async (req, res) => {
  try {
    const userWithRole = await User.findByPk(req.user.id, {
      include: [{ model: Role }]
    });
    const userRole = userWithRole && userWithRole.Role ? (userWithRole.Role.name || '').toLowerCase() : '';
    if (userRole !== 'admin' && userRole !== 'super admin') {
      return res.status(403).json({ message: 'Access denied: Only admins can upload orders' });
    }
    const userId = req.user ? req.user.id : 1; // Default to admin if no user
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    const filePathOnDisk = file.path;

    const wb = xlsx.readFile(filePathOnDisk, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    
    if (!rows || rows.length < 2) {
      return res.status(422).json({ message: 'No data rows found', errors: [{ row: 1, message: 'Missing header/data rows' }] });
    }
    
    const headerRow = rows[0];
    const idxMap = buildHeaderIndex(headerRow);

    // Validate required headers
    // Note: 'Order ID' and 'Order Type' columns are expected, but values can be optional depending on logic below
    const missing = REQUIRED_HEADERS.filter(h => idxMap[h.toLowerCase()] === undefined);
    // Relax validation if only 'Order Type' is missing (for backward compatibility if needed, but user asked for it)
    // However, user said "will have... order type", so we enforce column presence but maybe not value.
    if (missing.length) {
      return res.status(422).json({ message: 'Invalid or missing headers', missing, required: REQUIRED_HEADERS });
    }

    let inserted = 0;
    const errors = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // Extract values
      const dateRaw = row[idxMap['date']];
      const customerName = String(row[idxMap['customer']] || '').trim();
      const mobileRaw = String(row[idxMap['phone']] || '').trim();
      const mobile = mobileRaw.replace(/[^0-9]/g, ''); // Basic sanitization
      const alternateRaw = String(row[idxMap['alternate']] || '').trim();
      const alternate = (['yes', 'y', 'true', '1'].includes(alternateRaw.toLowerCase())) ? 'Yes' : (alternateRaw ? 'No' : '');
      const orderId = String(row[idxMap['order id']] || '').trim();
      const fileOrderType = String(row[idxMap['order type']] || '').trim(); 
      const orderType = req.body.orderType || fileOrderType; // IVR, MissCall, Custom
      const amount = row[idxMap['amount']];
      const status = String(row[idxMap['status']] || '').trim();
      const agentName = String(row[idxMap['agent']] || '').trim();
      
      // Validate Mandatory Fields
      if (!mobile || mobile.length < 10) {
        errors.push({ row: i + 1, message: 'Invalid Mobile Number' });
        continue;
      }
      if (!customerName) {
        errors.push({ row: i + 1, message: 'Missing Customer Name' });
        continue;
      }
      // Order ID is now optional as per user request
      
      try {
        // 1. Find or Create Customer
        // Use loose matching for phone (last 10 digits) to handle +91 prefix differences
        const last10 = mobile.slice(-10);
        let customer = await Customer.findOne({ 
            where: { 
                phone: { [Op.like]: `%${last10}` } 
            } 
        });

        if (!customer) {
          // Split name into first and last
          const nameParts = customerName.split(' ');
          const firstName = nameParts[0] || 'Unknown';
          const lastName = nameParts.slice(1).join(' ') || '.';
          
          customer = await Customer.create({
            phone: mobile,
            firstName: firstName,
            lastName: lastName,
            status: 'Active'
          });
        }

        // 2. Create Call Record (Order)
        // Check if a call with this orderId exists (only if orderId is present)
        if (orderId) {
            const existingCall = await Call.findOne({ 
                where: { 
                    orderId: orderId 
                } 
            });

            if (existingCall) {
                errors.push({ row: i + 1, message: `Order ID ${orderId} already exists` });
                continue;
            }
        }

        // Find Agent by name or use current user
        // Note: Ideally we should map agent name to ID. For now, we'll try to find a user by name, else fallback to current user.
        let assignedAgentId = userId;
        if (agentName) {
            const agentUser = await User.findOne({ 
                where: sequelize.where(
                    sequelize.fn('concat', sequelize.col('firstName'), ' ', sequelize.col('lastName')), 
                    { [Op.like]: `%${agentName}%` }
                )
            });
            if (agentUser) assignedAgentId = agentUser.id;
        }

        // Parse Date
        let orderDate = new Date();
        if (dateRaw) {
             // Handle Excel date serial or string
             if (typeof dateRaw === 'number') {
                 // xlsx cellDates: true handles this, but if not:
                 // orderDate = new Date(Math.round((dateRaw - 25569)*86400*1000));
                 orderDate = new Date(dateRaw); // if cellDates:true, this is likely already a Date object or parsable
             } else if (typeof dateRaw === 'string') {
                 // Handle "DD-MMM" format (e.g. "5-Jan") by appending current year
                 if (/^\d{1,2}-[A-Za-z]{3}$/.test(dateRaw.trim())) {
                     const currentYear = new Date().getFullYear();
                     orderDate = new Date(`${dateRaw.trim()}-${currentYear}`);
                 } else {
                     orderDate = new Date(dateRaw);
                 }
             } else {
                 orderDate = new Date(dateRaw);
             }
             if (isNaN(orderDate.getTime())) orderDate = new Date(); // Fallback
        }

        await Call.create({
          customerId: customer.id,
          agentId: assignedAgentId,
          orderId: orderId || null,
          date: orderDate,
          callType: 'Order Upload',
          category: orderType || 'System Import',
          outcome: 'Completed',
          notes: `Imported via Bulk Upload. Type: ${orderType}. Status: ${status}. Agent: ${agentName}. File: ${file.originalname}`,
          orderDetails: {
            orderId: orderId,
            orderType: orderType,
            customerName: customerName,
            customerMobileNo: mobile,
            alternate: alternate,
            amount: amount,
            status: status,
            agentName: agentName
          }
        });

        inserted++;
      } catch (e) {
        console.error(e);
        errors.push({ row: i + 1, message: e.message || 'Insert failed' });
      }
    }

    const skipped = errors.length;
    return res.status(inserted > 0 ? 201 : 422).json({ 
        message: `Processed ${rows.length - 1} rows`,
        inserted, 
        skipped, 
        errors 
    });

  } catch (error) {
    console.error('Order upload failed:', error);
    return res.status(500).json({ message: 'Upload failed', error: error.message });
  }
};

// Download Template
 exports.downloadTemplate = async (req, res) => {
   try {
     const wb = xlsx.utils.book_new();
     // Headers matching user requirements
     const wsData = [
       ['Date', 'Customer', 'Phone', 'Alternate', 'Order ID', 'Order Type', 'Amount', 'Status', 'Agent'],
       ['5-Jan', 'Umar', '9082772947', 'Yes', 'PO90909090909090', 'IVR', 2000, 'Completed', 'Mantasha Ansari']
     ];
     const ws = xlsx.utils.aoa_to_sheet(wsData);
     xlsx.utils.book_append_sheet(wb, ws, 'Template');
    
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename="Order_Upload_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Template download failed:', error);
    res.status(500).json({ message: 'Failed to generate template' });
  }
};

// Get Re-orders (uploaded orders filtered by upload date range, search, and pagination)
exports.getReorders = async (req, res) => {
  try {
    // Check user role for permission
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Role }]
    });

    const isAdmin = user.Role && (user.Role.name === 'Super Admin' || user.Role.name === 'Admin');
    const fromStr = (req.query.from || '').toString().trim();
    const toStr = (req.query.to || '').toString().trim();
    const search = (req.query.search || '').toString().trim();

    const parseYMD = (s) => {
      if (!s) return null;
      const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
      if (!m) return null;
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const d = parseInt(m[3], 10);
      return new Date(y, mo, d, 0, 0, 0, 0);
    };

    const today = new Date();
    let start = parseYMD(fromStr) || new Date(today);
    let end = parseYMD(toStr) || new Date(start);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const endExclusive = new Date(end.getTime());
    endExclusive.setDate(endExclusive.getDate() + 1);

    const baseWhere = {
      callType: 'Order Upload',
      createdAt: { [Op.gte]: start, [Op.lt]: endExclusive }
    };

    if (!isAdmin) {
      baseWhere.agentId = req.user.id;
    }

    let customerWhere = undefined;
    const callSearchWhere = [];
    const hasSearch = search.length > 0;
    if (hasSearch) {
      callSearchWhere.push(
        { orderId: { [Op.like]: `%${search}%` } },
        { category: { [Op.like]: `%${search}%` } },
        { notes: { [Op.like]: `%${search}%` } },
        { outcome: { [Op.like]: `%${search}%` } }
      );
      const digitsOnly = search.replace(/[^0-9]/g, '');
      const phoneFilter = digitsOnly.length >= 5 ? { phone: { [Op.like]: `%${digitsOnly}%` } } : undefined;
      const ors = [
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } }
      ];
      if (phoneFilter) ors.push(phoneFilter);
      customerWhere = { [Op.or]: ors };
    }

    const include = [
      customerWhere
        ? { model: Customer, where: customerWhere, required: true }
        : { model: Customer },
      { model: User, as: 'agent', attributes: ['id', 'firstName', 'lastName'] }
    ];

    const where = hasSearch
      ? { [Op.and]: [baseWhere, { [Op.or]: callSearchWhere }] }
      : baseWhere;

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 100;
    const offset = (page - 1) * pageSize;

    const { count, rows } = await Call.findAndCountAll({
      where,
      include,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset
    });

    res.json({ rows, count, page, pageSize });
  } catch (error) {
    console.error('Get re-orders failed:', error);
    res.status(500).json({ message: 'Failed to fetch re-orders', error: error.message });
  }
};

// Get Re-orders Count (uploaded orders count by upload date range)
exports.getReordersCount = async (req, res) => {
  try {
    // Check user role for permission
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Role }]
    });

    const isAdmin = user.Role && (user.Role.name === 'Super Admin' || user.Role.name === 'Admin');
    const fromStr = (req.query.from || '').toString().trim();
    const toStr = (req.query.to || '').toString().trim();

    const parseYMD = (s) => {
      if (!s) return null;
      const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
      if (!m) return null;
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const d = parseInt(m[3], 10);
      return new Date(y, mo, d, 0, 0, 0, 0);
    };

    const today = new Date();
    let start = parseYMD(fromStr) || new Date(today);
    let end = parseYMD(toStr) || new Date(start);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const endExclusive = new Date(end.getTime());
    endExclusive.setDate(endExclusive.getDate() + 1);

    const where = {
      callType: 'Order Upload',
      createdAt: { [Op.gte]: start, [Op.lt]: endExclusive }
    };

    if (!isAdmin) {
      where.agentId = req.user.id;
    }

    const count = await Call.count({ where });

    res.json({ count });
  } catch (error) {
    console.error('Get re-orders count failed:', error);
    res.status(500).json({ message: 'Failed to fetch re-orders count', error: error.message });
  }
};

// Get Uploaded Orders (filtered by upload date range, defaults to today)
exports.getUploadedOrders = async (req, res) => {
  try {
    // Check user role for permission
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Role }]
    });

    const isAdmin = user.Role && (user.Role.name === 'Super Admin' || user.Role.name === 'Admin');
    const fromStr = (req.query.from || '').toString().trim();
    const toStr = (req.query.to || '').toString().trim();

    const parseYMD = (s) => {
      if (!s) return null;
      const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
      if (!m) return null;
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const d = parseInt(m[3], 10);
      return new Date(y, mo, d, 0, 0, 0, 0);
    };

    const today = new Date();
    let start = parseYMD(fromStr) || new Date(today);
    let end = parseYMD(toStr) || new Date(start);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const endExclusive = new Date(end.getTime());
    endExclusive.setDate(endExclusive.getDate() + 1);

    const where = {
      callType: 'Order Upload',
      createdAt: { [Op.gte]: start, [Op.lt]: endExclusive }
    };

    // If not admin, restrict to own uploads/assigned orders
    if (!isAdmin) {
       where.agentId = req.user.id; 
    }

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const offset = (page - 1) * pageSize;

    const { rows, count } = await Call.findAndCountAll({
      where,
      include: [
        { model: Customer },
        { model: User, as: 'agent', attributes: ['id', 'firstName', 'lastName'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset
    });

    res.json({ data: rows, total: count, page, pageSize });
  } catch (error) {
    console.error('Get uploaded orders failed:', error);
    res.status(500).json({ message: 'Failed to fetch uploaded orders', error: error.message });
  }
};

// Update Order Status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { caseStatus, subStatus, followUpDate, closeReason } = req.body;
    const userId = req.user.id;
    
    const call = await Call.findByPk(id);
    if (!call) {
      return res.status(404).json({ message: 'Order record not found' });
    }

    // Determine new outcome and follow-up details
    let newOutcome = '';
    let newFollowUpDate = null;
    let newFollowUpRequired = false;

    if (caseStatus === 'Open') {
      newOutcome = subStatus; // Ringing, Follow-up
      if (subStatus === 'Follow-up') {
        if (!followUpDate) {
          return res.status(400).json({ message: 'Follow-up date is required' });
        }
        newFollowUpDate = new Date(followUpDate);
        newFollowUpRequired = true;
      }
    } else if (caseStatus === 'Close') {
      newOutcome = closeReason; // Order Created, Reorder, Not Interested
    } else {
      return res.status(400).json({ message: 'Invalid Case Status' });
    }

    const previousOutcome = call.outcome || null;

    // Update the call record
    await call.update({
      outcome: newOutcome,
      followUpDate: newFollowUpDate,
      followUpRequired: newFollowUpRequired,
      // Update orderDetails status if needed, or keep history in notes?
      // Let's append to notes for history
      notes: (call.notes || '') + `\n[${new Date().toLocaleString()}] Status updated to: ${newOutcome}`
    });

    if (newOutcome && previousOutcome !== newOutcome) {
      try {
        await CallStatusHistory.create({
          CallId: call.id,
          PreviousStatus: previousOutcome,
          NewStatus: newOutcome,
          ChangedBy: userId
        });
      } catch (e) {
        console.error('Failed to persist order status history', e);
      }
    }

    res.json({ message: 'Status updated successfully', call });
  } catch (error) {
    console.error('Update order status failed:', error);
    res.status(500).json({ message: 'Failed to update status', error: error.message });
  }
};
