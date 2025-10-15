const { Customer, User, Role } = require('../models');
const { Op } = require('sequelize');
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

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
exports.getCustomers = async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;
    const status = (req.query.status || '').toString().trim();
    const sortBy = (req.query.sortBy || 'createdAt').toString();
    const sortOrder = ((req.query.sortOrder || 'DESC').toString().toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

    const like = q ? { [Op.like]: `%${q}%` } : null;
    const where = {};
    if (q) {
      where[Op.or] = [
        { firstName: like },
        { lastName: like },
        { phone: like }
      ];
    }
    if (status) {
      where.status = status;
    }

    const allowedSort = ['createdAt', 'firstName', 'lastName', 'phone', 'status'];
    const order = allowedSort.includes(sortBy) ? [[sortBy, sortOrder]] : [['createdAt', 'DESC']];

    // Restrict visibility per role
    const visibility = await getVisibility(req.user);
    // Agents can see all customers; do not restrict by assignedAgentId
    // if (visibility.scope === 'manager') {
    //   where.assignedAgentId = { [Op.in]: visibility.allowedAgentIds };
    // }

    const { rows, count } = await Customer.findAndCountAll({
      where,
      include: [{ model: User, as: 'assignedAgent', attributes: ['id', 'firstName', 'lastName'] }],
      limit: pageSize,
      offset,
      order
    });
    res.json({ data: rows, total: count, page, pageSize });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get customer by ID
// @route   GET /api/customers/:id
// @access  Private
exports.getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id, {
      include: [{ model: User, as: 'assignedAgent', attributes: ['id', 'firstName', 'lastName'] }]
    });

    if (customer) {
      const visibility = await getVisibility(req.user);
      // Agents can view any customer; managers are restricted to their team
      if (visibility.scope === 'manager' && !visibility.allowedAgentIds.includes(customer.assignedAgentId)) {
        return res.status(403).json({ message: 'Not authorized to view this customer' });
      }
      res.json(customer);
    } else {
      res.status(404).json({ message: 'Customer not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create a customer
// @route   POST /api/customers
// @access  Private
exports.createCustomer = async (req, res) => {
  try {
    const { firstName, lastName, phone, address, assignedAgentId, status, notes, name } = req.body;

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

    const visibility = await getVisibility(req.user);

    // For non-admins, restrict assignment to allowed agents
    let finalAssignedAgentId = assignedAgentId;
    if (visibility.scope === 'agent') {
      finalAssignedAgentId = req.user.id;
    } else if (visibility.scope === 'manager') {
      finalAssignedAgentId = visibility.allowedAgentIds.includes(assignedAgentId)
        ? assignedAgentId
        : req.user.id;
    }

    const customer = await Customer.create({
      firstName: fName,
      lastName: lName,
      phone,
      address,
      assignedAgentId: finalAssignedAgentId,
      status,
      notes
    });

    res.status(201).json(customer);
  } catch (error) {
    console.error(error);
    if (error && (error.name === 'SequelizeUniqueConstraintError' || error.original?.code === 'EREQUEST')) {
      return res.status(409).json({ message: 'Phone already exists' });
    }
    res.status(500).json({ message: 'Server error' });
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

    const { firstName, lastName, name, phone, address, assignedAgentId, status, notes } = req.body;
    const visibility = await getVisibility(req.user);
    if (visibility.scope === 'agent' && customer.assignedAgentId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this customer' });
    }
    if (visibility.scope === 'manager' && !visibility.allowedAgentIds.includes(customer.assignedAgentId)) {
      return res.status(403).json({ message: 'Not authorized to update this customer' });
    }

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
    // Reassignment: Admins can reassign freely; Managers only within team; Agents cannot
    if (assignedAgentId !== undefined) {
      if (visibility.scope === 'admin') {
        customer.assignedAgentId = assignedAgentId;
      } else if (visibility.scope === 'manager') {
        customer.assignedAgentId = visibility.allowedAgentIds.includes(assignedAgentId)
          ? assignedAgentId
          : customer.assignedAgentId;
      } else {
        customer.assignedAgentId = req.user.id;
      }
    }
    if (status) customer.status = status;
    if (notes !== undefined) customer.notes = notes;

    await customer.save();
    res.json(customer);
  } catch (error) {
    console.error(error);
    if (error && (error.name === 'SequelizeUniqueConstraintError' || error.original?.code === 'EREQUEST')) {
      return res.status(409).json({ message: 'Phone already exists' });
    }
    res.status(500).json({ message: 'Server error' });
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

    const visibility = await getVisibility(req.user);
    if (visibility.scope === 'agent' && customer.assignedAgentId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this customer' });
    }
    if (visibility.scope === 'manager' && !visibility.allowedAgentIds.includes(customer.assignedAgentId)) {
      return res.status(403).json({ message: 'Not authorized to delete this customer' });
    }

    await customer.destroy();
    res.json({ message: 'Customer removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Upload files for a customer
// @route   POST /api/customers/:id/files
// @access  Private
exports.uploadCustomerFiles = async (req, res) => {
  try {
    const customerId = req.params.id;
    const visibility = await getVisibility(req.user);
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    if (visibility.scope === 'agent' && customer.assignedAgentId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to upload files for this customer' });
    }
    if (visibility.scope === 'manager' && !visibility.allowedAgentIds.includes(customer.assignedAgentId)) {
      return res.status(403).json({ message: 'Not authorized to upload files for this customer' });
    }
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
    const visibility = await getVisibility(req.user);
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    // Agents can view files for any customer; managers restricted to their team
    if (visibility.scope === 'manager' && !visibility.allowedAgentIds.includes(customer.assignedAgentId)) {
      return res.status(403).json({ message: 'Not authorized to view files for this customer' });
    }
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
    const visibility = await getVisibility(req.user);
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    if (visibility.scope === 'agent' && customer.assignedAgentId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete files for this customer' });
    }
    if (visibility.scope === 'manager' && !visibility.allowedAgentIds.includes(customer.assignedAgentId)) {
      return res.status(403).json({ message: 'Not authorized to delete files for this customer' });
    }
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