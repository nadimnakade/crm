const path = require('path');
const xlsx = require('xlsx');
const fs = require('fs');
const { Call, Customer, User, Role } = require('../models');
const { Op } = require('sequelize');

// Expected headers for bulk upload (case-insensitive match)
// User requirements: moible no, name, orderid, MRP, Pay
const REQUIRED_HEADERS = [
  'Mobile No',
  'Name',
  'OrderId',
  'MRP',
  'Pay'
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
    const missing = REQUIRED_HEADERS.filter(h => idxMap[h.toLowerCase()] === undefined);
    if (missing.length) {
      return res.status(422).json({ message: 'Invalid or missing headers', missing, required: REQUIRED_HEADERS });
    }

    let inserted = 0;
    const errors = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // Extract values
      const mobileRaw = String(row[idxMap['mobile no']] || '').trim();
      const mobile = mobileRaw.replace(/[^0-9]/g, ''); // Basic sanitization
      const name = String(row[idxMap['name']] || '').trim();
      const orderId = String(row[idxMap['orderid']] || '').trim();
      const mrp = row[idxMap['mrp']];
      const pay = row[idxMap['pay']];
      // Alternate is Yes/No flag
      const alternateRaw = String(row[idxMap['alternate']] || row[idxMap['alternate required']] || '').trim();
      const altLower = alternateRaw.toLowerCase();
      const alternate = (['yes', 'y', 'true', '1'].includes(altLower)) ? 'Yes' : (alternateRaw ? 'No' : '');
      
      // Validate Mandatory Fields
      if (!mobile || mobile.length < 10) {
        errors.push({ row: i + 1, message: 'Invalid Mobile Number' });
        continue;
      }
      if (!name) {
        errors.push({ row: i + 1, message: 'Missing Name' });
        continue;
      }
      if (!orderId) {
        errors.push({ row: i + 1, message: 'Missing OrderId' });
        continue;
      }
      if (mrp === undefined || mrp === '' || pay === undefined || pay === '') {
        errors.push({ row: i + 1, message: 'Missing MRP or Pay' });
        continue;
      }

      try {
        // 1. Find or Create Customer
        // Map mobile to phone, name to firstName/lastName
        let customer = await Customer.findOne({ where: { phone: mobile } });
        if (!customer) {
          // Split name into first and last
          const nameParts = name.split(' ');
          const firstName = nameParts[0] || 'Unknown';
          const lastName = nameParts.slice(1).join(' ') || '.';
          
          customer = await Customer.create({
            phone: mobile,
            // alternatePhone removed as it is not a phone number
            firstName: firstName,
            lastName: lastName,
            status: 'Active'
          });
        }
        // Removed alternatePhone update logic

        // 2. Create Call Record (Order)
        // Check if order already exists? Maybe skip duplicate OrderIds?
        // For now, let's assume we allow multiple entries or user manages dupes.
        // But usually OrderId should be unique. 
        // Let's check if a call with this orderId exists.
        const existingCall = await Call.findOne({ 
            where: { 
                orderId: orderId 
            } 
        });

        if (existingCall) {
            errors.push({ row: i + 1, message: `Order ID ${orderId} already exists` });
            continue;
        }

        await Call.create({
          customerId: customer.id,
          agentId: userId,
          orderId: orderId,
          date: new Date(),
          callType: 'Order Upload',
          category: 'System Import',
          outcome: 'Completed',
          notes: `Imported via Bulk Upload. File: ${file.originalname}`,
          orderDetails: {
            orderId: orderId,
            customerName: name,
            customerMobileNo: mobile,
            alternate: alternate, // Store Yes/No
            mrp: mrp,
            pay: pay
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
       ['Mobile No', 'Name', 'OrderId', 'MRP', 'Pay', 'Alternate'],
       ['9876543210', 'John Doe', 'ORD-001', 1000, 900, 'Yes'] // Example row
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

// Get Re-orders (orders from exactly 1 month ago)
exports.getReorders = async (req, res) => {
  try {
    // Check user role for permission
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Role, as: 'role' }]
    });

    const isAdmin = user.role && (user.role.name === 'Super Admin' || user.role.name === 'Admin');

    const today = new Date();
    // Calculate date 1 month ago
    const targetDate = new Date(today);
    targetDate.setMonth(today.getMonth() - 1);
    
    // Set time range for that day (00:00:00 to 23:59:59)
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    // Determine query conditions
    const where = {
      date: {
        [Op.between]: [startOfDay, endOfDay]
      },
      [Op.or]: [
        { category: 'Order' },
        { category: 'System Import' }, // Matches uploadOrders
        { orderId: { [Op.ne]: null } }
      ]
    };

    // If not admin, restrict to own orders
    if (!isAdmin) {
      where.agentId = req.user.id;
    }
    
    // Include Customer and Agent info
    const calls = await Call.findAll({
      where,
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'agent', attributes: ['id', 'firstName', 'lastName'] }
      ],
      order: [['date', 'DESC']]
    });

    res.json(calls);
  } catch (error) {
    console.error('Get re-orders failed:', error);
    res.status(500).json({ message: 'Failed to fetch re-orders', error: error.message });
  }
};

// Get Re-orders Count
exports.getReordersCount = async (req, res) => {
  try {
    // Check user role for permission
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Role, as: 'role' }]
    });

    const isAdmin = user.role && (user.role.name === 'Super Admin' || user.role.name === 'Admin');

    const today = new Date();
    // Calculate date 1 month ago
    const targetDate = new Date(today);
    targetDate.setMonth(today.getMonth() - 1);
    
    // Set time range for that day (00:00:00 to 23:59:59)
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    // Determine query conditions
    const where = {
      date: {
        [Op.between]: [startOfDay, endOfDay]
      },
      [Op.or]: [
        { category: 'Order' },
        { category: 'System Import' }, 
        { orderId: { [Op.ne]: null } }
      ]
    };

    // If not admin, restrict to own orders
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