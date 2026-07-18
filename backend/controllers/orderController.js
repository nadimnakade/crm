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
    if (userRole !== 'admin' && userRole !== 'super admin' && userRole !== 'superadmin') {
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
    if (missing.length) {
      return res.status(422).json({ message: `Missing required headers: ${missing.join(', ')}. Required columns: ${REQUIRED_HEADERS.join(', ')}`, missing, required: REQUIRED_HEADERS });
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
        errors.push({ row: i + 1, message: `Invalid Mobile Number (got "${mobileRaw}")` });
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
        const detail = e.message || 'Insert failed';
        errors.push({ row: i + 1, message: `DB error: ${detail}`, customerName, mobile: mobileRaw, orderId });
      }
    }

    const skipped = errors.length;
    const errorSummary = {};
    for (const e of errors) {
      const key = e.message.replace(/\s*\(got ".*"\)/, '');
      errorSummary[key] = (errorSummary[key] || 0) + 1;
    }
    return res.status(inserted > 0 ? 201 : 422).json({ 
        message: `Processed ${rows.length - 1} rows`,
        inserted, 
        skipped, 
        totalRows: rows.length - 1,
        errorSummary,
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
    const roleId = Number(req.user?.roleId);
    const isAdmin = [1, 2, 1004].includes(roleId);
    const fromStr = (req.query.from || '').toString().trim();
    const toStr = (req.query.to || '').toString().trim();
    const search = (req.query.search || '').toString().trim();

    const todayStr = new Date().toISOString().slice(0, 10);
    const fd = fromStr || todayStr;
    const td = toStr || fromStr || todayStr;

    const baseWhere = {
      callType: 'Order Upload',
      outcome: 'Completed'
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
        ? { model: Customer, where: customerWhere, required: true, attributes: ['id', 'firstName', 'lastName', 'phone'] }
        : { model: Customer, attributes: ['id', 'firstName', 'lastName', 'phone'] },
      { model: User, as: 'agent', attributes: ['id', 'firstName', 'lastName'] }
    ];

    const dateCondition = sequelize.where(
      sequelize.literal('CAST(DATEADD(MINUTE, 330, [Call].[createdAt]) AS DATE)'),
      { [Op.between]: [fd, td] }
    );
    const where = hasSearch
      ? { [Op.and]: [baseWhere, dateCondition, { [Op.or]: callSearchWhere }] }
      : { [Op.and]: [baseWhere, dateCondition] };

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 100, 200);
    const offset = (page - 1) * pageSize;

    const { count, rows } = await Call.findAndCountAll({
      where,
      attributes: [
        'id',
        'customerId',
        'agentId',
        'orderId',
        'callType',
        'category',
        'outcome',
        'notes',
        'orderDetails',
        'followUpRequired',
        'followUpDate',
        'createdAt'
      ],
      include,
      order: [
        ['followUpRequired', 'DESC'],
        [sequelize.literal('CASE WHEN followUpDate IS NULL THEN 1 ELSE 0 END'), 'ASC'],
        ['followUpDate', 'ASC'],
        ['createdAt', 'DESC'],
        ['id', 'DESC']
      ],
      limit: pageSize,
      offset,
      subQuery: false,
      distinct: true
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
    const roleId = Number(req.user?.roleId);
    const isAdmin = [1, 2, 1004].includes(roleId);
    const fromStr = (req.query.from || '').toString().trim();
    const toStr = (req.query.to || '').toString().trim();

    const todayStr = new Date().toISOString().slice(0, 10);
    const fd = fromStr || todayStr;
    const td = toStr || fromStr || todayStr;

    const where = {
      callType: 'Order Upload',
      outcome: { 
        [Op.notIn]: [
          'Order Created',
          'Reorder',
          'Re-Followup',
          'No Answer',
          'DND',
          'Lead',
          'Transfer',
          'Order already Placed',
          'Order Already Placed',
          'Not required',
          'Pending',
          'Not Interested'
        ] 
      }
    };

    if (!isAdmin) {
      where.agentId = req.user.id;
    }

    const dateCondition = sequelize.where(
      sequelize.literal('CAST(DATEADD(MINUTE, 330, [Call].[createdAt]) AS DATE)'),
      { [Op.between]: [fd, td] }
    );
    const finalWhere = { [Op.and]: [where, dateCondition] };
    const count = await Call.count({ where: finalWhere });

    res.json({ count });
  } catch (error) {
    console.error('Get re-orders count failed:', error);
    res.status(500).json({ message: 'Failed to fetch re-orders count', error: error.message });
  }
};

// Get Uploaded Orders (filtered by upload date range, defaults to today)
exports.getUploadedOrders = async (req, res) => {
  try {
    const roleId = Number(req.user?.roleId);
    const isAdmin = [1, 2, 1004].includes(roleId);
    const fromStr = (req.query.from || '').toString().trim();
    const toStr = (req.query.to || '').toString().trim();

    const todayStr = new Date().toISOString().slice(0, 10);
    const fd = fromStr || todayStr;
    const td = toStr || fromStr || todayStr;

    const where = {
      callType: 'Order Upload'
    };

    // If not admin, restrict to own uploads/assigned orders
    if (!isAdmin) {
       where.agentId = req.user.id; 
    }

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const offset = (page - 1) * pageSize;

    const dateCondition = sequelize.where(
      sequelize.literal('CAST(DATEADD(MINUTE, 330, [Call].[createdAt]) AS DATE)'),
      { [Op.between]: [fd, td] }
    );
    const finalWhere = { [Op.and]: [where, dateCondition] };
    const { rows, count } = await Call.findAndCountAll({
      where: finalWhere,
      attributes: [
        'id',
        'customerId',
        'agentId',
        'orderId',
        'callType',
        'category',
        'outcome',
        'notes',
        'orderDetails',
        'followUpRequired',
        'followUpDate',
        'createdAt'
      ],
      include: [
        { model: Customer, attributes: ['id', 'firstName', 'lastName', 'phone'] },
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
      newOutcome = subStatus;
      const needsFollowUpDate = [
        'Call back',
        'Fresh Followup',
        'Re-Followup',
        'Timing',
        'Follow-up',
        'Follow Up',
        'Followup',
        'Follow-up Scheduled',
        'Follow Up Scheduled',
        'Followup Scheduled'
      ].includes(subStatus);
      if (needsFollowUpDate) {
        if (!followUpDate) {
          return res.status(400).json({ message: 'Follow-up date is required' });
        }
        const d = new Date(followUpDate);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ message: 'Invalid follow-up date' });
        }
        newFollowUpDate = d;
        newFollowUpRequired = true;
      } else {
        newFollowUpRequired = false;
        newFollowUpDate = null;
      }
    } else if (caseStatus === 'Close') {
      newOutcome = closeReason; // Order Created, Reorder, Not Interested, Re-Followup
      if (['Re-Followup', 'Follow-up', 'Follow Up', 'Followup', 'Follow-up Scheduled', 'Follow Up Scheduled', 'Followup Scheduled'].includes(closeReason)) {
        if (!followUpDate) {
          return res.status(400).json({ message: 'Follow-up date is required' });
        }
        const d = new Date(followUpDate);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ message: 'Invalid follow-up date' });
        }
        newFollowUpRequired = true;
        newFollowUpDate = d;
      } else {
        newFollowUpRequired = false;
        newFollowUpDate = null;
      }
    } else {
      return res.status(400).json({ message: 'Invalid Case Status' });
    }

    const previousOutcome = call.outcome || null;

    // Update the call record
    await call.update({
      outcome: newOutcome,
      followUpDate: newFollowUpDate,
      followUpRequired: newFollowUpRequired
    });

    // Always append status history for tracking interactions, even if status is unchanged
    if (newOutcome) {
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

    if (newFollowUpRequired && newFollowUpDate) {
      try {
        const customer = await Customer.findByPk(call.customerId, { attributes: ['phone'] });
        const toLast10Digits = (v) => {
          const digits = (v || '').toString().replace(/[^0-9]/g, '');
          if (!digits) return null;
          return digits.length > 10 ? digits.slice(-10) : digits;
        };
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
            await Call.update(
              {
                followUpRequired: false,
                followUpDate: null,
                reason: 'Superseded by newer follow-up date'
              },
              {
                where: {
                  customerId: { [Op.in]: customerIds },
                  id: { [Op.ne]: call.id },
                  followUpRequired: true
                }
              }
            );
          }
        }
      } catch (e) {
        console.error('Failed to clear older follow-ups when rescheduling order', e);
      }
    }

    const orderPlacedOutcomes = ['Order Created', 'Order'];
    if (orderPlacedOutcomes.includes(newOutcome)) {
      try {
        const customer = await Customer.findByPk(call.customerId, { attributes: ['phone'] });
        const customerPhone = customer?.phone;
        const toLast10Digits = (v) => {
          const digits = (v || '').toString().replace(/[^0-9]/g, '');
          if (!digits) return null;
          return digits.length > 10 ? digits.slice(-10) : digits;
        };
        const last10 = toLast10Digits(customerPhone);
        if (last10) {
          const customersWithSamePhone = await Customer.findAll({
            where: { phone: { [Op.like]: `%${last10}` } },
            attributes: ['id', 'phone']
          });
          const customerIds = customersWithSamePhone
            .filter(c => toLast10Digits(c.phone) === last10)
            .map(c => c.id);
          
          await Call.update(
            {
              outcome: 'Order Already Placed',
              reason: 'Order placed via reorder',
              followUpRequired: false,
              followUpDate: null
            },
            {
              where: {
                customerId: { [Op.in]: customerIds },
                id: { [Op.ne]: id },
                followUpRequired: true,
                outcome: { [Op.notIn]: ['Order', 'Order Already Placed'] }
              }
            }
          );
        }
      } catch (e) {
        console.error('Failed to clear other follow-ups after reorder tagging', e);
      }
    }

    res.json({
      message: 'Status updated successfully',
      call: {
        id: call.id,
        outcome: call.outcome,
        notes: call.notes,
        followUpDate: call.followUpDate,
        followUpRequired: call.followUpRequired
      }
    });
  } catch (error) {
    console.error('Update order status failed:', error);
    res.status(500).json({ message: 'Failed to update status', error: error.message });
  }
};
