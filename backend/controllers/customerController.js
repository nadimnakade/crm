const { Customer, User, Role, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');

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
    // Include self in scope; managers may also be agents
    return { scope: 'manager', allowedAgentIds: [...teamIds, user.id] };
  }
  // Agent
  return { scope: 'agent', allowedAgentIds: [user.id] };
};


exports.getCustomers = async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const status = (req.query.status || '').toString().trim();
    const cursorIdRaw = req.query.cursorId;
    let cursorId = cursorIdRaw ? parseInt(cursorIdRaw, 10) : null;
    if (Number.isNaN(cursorId)) cursorId = null;

    const clauses = [];
    const replacements = {};
    let digits = '';

    if (q) {
      digits = q.replace(/\D/g, '');
      if (digits.length > 0) {
        replacements.phoneExact = digits;
        replacements.phonePrefix = `${digits}%`;
        clauses.push('(PhoneDigits = :phoneExact OR PhoneDigits LIKE :phonePrefix)');
      } else {
        // Non-digit query: avoid slow scans until FTS is available
        clauses.push('1 = 0');
      }
    }

    if (status) {
      clauses.push('status = :status');
      replacements.status = status;
    }

    if (cursorId && cursorId > 0) {
      clauses.push('id < :cursorId');
      replacements.cursorId = cursorId;
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    // Total count: fast metadata when no filters; indexed count when digit filter
    let total = 0;
    if (clauses.length === 0) {
      const fastCountRows = await sequelize.query(
        `SELECT SUM(rows) AS count
         FROM sys.partitions
         WHERE object_id = OBJECT_ID('dbo.Customers') AND index_id IN (0,1)`,
        { type: QueryTypes.SELECT }
      );
      total = Number(fastCountRows?.[0]?.count || 0);
    } else if (digits.length > 0) {
      const countRows = await sequelize.query(
        `SELECT COUNT_BIG(*) AS count FROM dbo.Customers WITH (NOLOCK)
         ${whereSql} OPTION (RECOMPILE)`,
        { replacements, type: QueryTypes.SELECT }
      );
      total = Number(countRows?.[0]?.count || 0);
    }

    // Keyset pagination: fetch pageSize+1 ordered by id DESC, optional cursor
    const fetchLimit = pageSize + 1;
    const dataSql = `
      SELECT TOP (:fetchLimit) id, firstName, lastName, phone, address, status, createdAt, updatedAt
      FROM dbo.Customers WITH (NOLOCK)
      ${whereSql}
      ORDER BY id DESC OPTION (RECOMPILE)
    `;
    const rows = await sequelize.query(dataSql, {
      replacements: { ...replacements, fetchLimit },
      type: QueryTypes.SELECT
    });

    let hasMore = false;
    let resultRows = rows;
    if (rows.length > pageSize) {
      hasMore = true;
      resultRows = rows.slice(0, pageSize);
    }
    const nextCursor = resultRows.length ? resultRows[resultRows.length - 1].id : cursorId;

    res.json({ data: resultRows, total, page, pageSize, hasMore, nextCursor });
  } catch (error) {
    console.error('Error fetching customers:', error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({ message: 'An error occurred while fetching customers.', details: error?.message });
  }
};
// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
// exports.getCustomers = async (req, res) => {
//   try {
//     const q = (req.query.q || '').toString().trim();
//     const page = parseInt(req.query.page, 10) || 1;
//     const pageSize = parseInt(req.query.pageSize, 10) || 10;
//     const offset = (page - 1) * pageSize;
//     const status = (req.query.status || '').toString().trim();
//     const cursorIdRaw = req.query.cursorId;
//     let cursorId = cursorIdRaw ? parseInt(cursorIdRaw, 10) : null;
//     if (Number.isNaN(cursorId)) cursorId = null;
//     // Sorting removed per requirements; always order by id DESC for performance

//     const like = q ? { [Op.like]: `%${q}%` } : null;
//     const where = {};
//     if (q) {
//       where[Op.or] = [        
//         { phone: like }
//       ];
//     }
//     if (status) {
//       where.status = status;
//     }

//     // Always order by id DESC (clustered PK), avoids expensive sorts on large tables

//     // Restrict visibility per role
//     const visibility = await getVisibility(req.user);
//     // Agents can see all customers; do not restrict by assignedAgentId
//     // if (visibility.scope === 'manager') {
//     //   where.assignedAgentId = { [Op.in]: visibility.allowedAgentIds };
//     // }

//     // Use raw count with NOLOCK to avoid long-running count(*) timeouts on large tables
//     const clauses = [];
//     const replacements = {};
//     let digits = '';
//     if (q) {
//       digits = q.replace(/\D/g, '');
//       if (digits.length > 0) {
//         replacements.phoneExact = digits;
//         replacements.phonePrefix = `${digits}%`;
//         clauses.push('(PhoneDigits = :phoneExact OR PhoneDigits LIKE :phonePrefix)');
//       } else {
//         // Non-digit query: return no rows quickly
//         clauses.push('1 = 0');
//       }
//     }
//     if (status) {
//       clauses.push('status = :status');
//       replacements.status = status;
//     }
//     if (cursorId && cursorId > 0) {
//       clauses.push('id < :cursorId');
//       replacements.cursorId = cursorId;
//     }
//     const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
//     let total = 0;
//     if (clauses.length > 0) {
//       const countHint = digits.length > 0 ? 'NOLOCK, INDEX(IX_Customers_PhoneDigits)' : 'NOLOCK';
//       const countRows = await sequelize.query(
//         `SELECT COUNT_BIG(*) AS count FROM dbo.Customers WITH (${countHint}) ${whereSql} OPTION (RECOMPILE)`,
//         { replacements, type: QueryTypes.SELECT }
//       );
//       total = Number(countRows?.[0]?.count || 0);
//     } else {
//       // Fast metadata count for full-table listing without filters
//       const fastCountRows = await sequelize.query(
//         `SELECT SUM(rows) AS count
//          FROM sys.partitions
//          WHERE object_id = OBJECT_ID('dbo.Customers') AND index_id IN (0,1)`,
//         { type: QueryTypes.SELECT }
//       );
//       total = Number(fastCountRows?.[0]?.count || 0);
//     }

//     // Keyset pagination: use TOP (pageSize+1) with id DESC and optional cursor
//     const dataHint = digits.length > 0 ? 'NOLOCK, INDEX(IX_Customers_PhoneDigits)' : 'NOLOCK';
//     const fetchLimit = pageSize + 1; // fetch one extra row to detect 'hasMore'
//     const dataSql = `
//       SELECT TOP (:fetchLimit) id, firstName, lastName, phone, address, status, createdAt, updatedAt
//       FROM dbo.Customers WITH (${dataHint})
//       ${whereSql}
//       ORDER BY id DESC OPTION (RECOMPILE)
//     `;
//     const rows = await sequelize.query(dataSql, {
//       replacements: { ...replacements, fetchLimit },
//       type: QueryTypes.SELECT
//     });

//     let hasMore = false;
//     let resultRows = rows;
//     if (rows.length > pageSize) {
//       hasMore = true;
//       resultRows = rows.slice(0, pageSize);
//     }
//     const nextCursor = resultRows.length ? resultRows[resultRows.length - 1].id : cursorId;

//     res.json({ data: resultRows, total, page, pageSize, hasMore, nextCursor });
//   } catch (error) {
//     console.error(error);
//     const status = error.status || 500;
//     const payload = {
//       message: (error && error.message) ? error.message : 'Server error',
//       name: error && error.name ? error.name : undefined,
//       details: error && (error.errors || (error.original && error.original.message))
//     };
//     res.status(status).json(payload);
//   }
// };

// @desc    Get customer by ID
// @route   GET /api/customers/:id
// @access  Private
exports.getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);

    if (customer) {      
      res.json(customer);
    } else {
      res.status(404).json({ message: 'Customer not found' });
    }
  } catch (error) {
    console.error(error);
    const payload = {
      message: (error && error.message) ? error.message : 'Server error'
    };
    if (error && error.name) payload.name = error.name;
    if (error && error.code) payload.code = error.code;
    if (error && error.sql) payload.sql = error.sql;
    if (error && error.errors) payload.errors = error.errors;
    if (error && error.original) {
      if (error.original.code) payload.dbCode = error.original.code;
      if (error.original.message) payload.dbMessage = error.original.message;
    }
    res.status(500).json(payload);
  }
};

// @desc    Create a customer
// @route   POST /api/customers
// @access  Private
exports.createCustomer = async (req, res) => {
  try {
    const { firstName, lastName, phone, address, status, name } = req.body;

    // Backward compatibility: if a single 'name' is provided, split into first/last
    let fName = firstName;
    let lName = lastName;
    if (name && (!firstName || !lastName)) {
      const parts = name.trim().split(' ');
      fName = parts[0] || '';
      lName = parts.slice(1).join(' ') || '';
    }

    // Uniqueness check for phone
    if (phone) {
      const existing = await Customer.findOne({
        where: { phone }
      });
      if (existing) {
        return res.status(409).json({ message: 'Phone already exists' });
      }
    }

    // Visibility no longer used for assignment; agents/managers can create customers

    const customer = await Customer.create({
      firstName: fName,
      lastName: lName,
      phone,
      address,
      status,
      
    });

    res.status(201).json(customer);
  } catch (error) {
    console.error(error);
    if (error && (error.name === 'SequelizeUniqueConstraintError' || error.original?.code === 'EREQUEST')) {
      return res.status(409).json({ message: 'Phone already exists' });
    }
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Update a customer
// @route   PUT /api/customers/:id
// @access  Private
exports.updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const { firstName, lastName, name, phone, address, status } = req.body;
    // No assigned agent restrictions; proceed with update

    // Map single 'name' to first/last if provided
    let fName = firstName;
    let lName = lastName;
    if (name && (!firstName || !lastName)) {
      const parts = name.trim().split(' ');
      fName = parts[0] || '';
      lName = parts.slice(1).join(' ') || '';
    }

    // Uniqueness check for phone excluding current record
    if (phone) {
      const conflict = await Customer.findOne({
        where: {
          id: { [Op.ne]: req.params.id },
          phone
        }
      });
      if (conflict) {
        return res.status(409).json({ message: 'Phone already exists' });
      }
    }

    // Update customer fields
    if (fName !== undefined) customer.firstName = fName;
    if (lName !== undefined) customer.lastName = lName;
    if (phone !== undefined) customer.phone = phone;
    if (address !== undefined) customer.address = address;
    if (status) customer.status = status;

    await customer.save();
    res.json(customer);
  } catch (error) {
    console.error(error);
    if (error && (error.name === 'SequelizeUniqueConstraintError' || error.original?.code === 'EREQUEST')) {
      return res.status(409).json({ message: 'Phone already exists' });
    }
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Delete a customer
// @route   DELETE /api/customers/:id
// @access  Private
exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // No assigned-agent restrictions; proceed with delete

    await customer.destroy();
    res.json({ message: 'Customer removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Upload files for a customer
// @route   POST /api/customers/:id/files
// @access  Private
exports.uploadCustomerFiles = async (req, res) => {
  try {
    const customerId = req.params.id;
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    // No assigned-agent restrictions; proceed
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ message: 'No files uploaded' });
    }
    const base = `/api/uploads/customer-${customerId}`;
    const payload = files.map(f => ({
      filename: f.filename,
      originalname: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      url: `${base}/${f.filename}`,
      uploadedAt: new Date()
    }));
    res.status(201).json({ files: payload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Upload failed' });
  }
};

// @desc    List files for a customer
// @route   GET /api/customers/:id/files
// @access  Private
exports.getCustomerFiles = async (req, res) => {
  try {
    const customerId = req.params.id;
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    // No assigned-agent restrictions; proceed
    const dir = path.join(__dirname, '../uploads', `customer-${customerId}`);
    if (!fs.existsSync(dir)) {
      return res.json({ files: [] });
    }
    const names = fs.readdirSync(dir).filter(name => !name.startsWith('.'));
    const base = `/api/uploads/customer-${customerId}`;
    const files = names.map(name => ({ filename: name, url: `${base}/${name}` }));
    res.json({ files });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to list files' });
  }
};

// @desc    Delete a specific file for a customer
// @route   DELETE /api/customers/:id/files/:filename
// @access  Private
exports.deleteCustomerFile = async (req, res) => {
  try {
    const customerId = req.params.id;
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    // No assigned-agent restrictions; proceed
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../uploads', `customer-${customerId}`, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }
    fs.unlinkSync(filePath);
    res.json({ message: 'File deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to delete file' });
  }
};