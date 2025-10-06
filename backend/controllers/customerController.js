const { Customer, User } = require('../models');
const { Op } = require('sequelize');

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
exports.getCustomers = async (req, res) => {
  try {
    const customers = await Customer.findAll({
      include: [{ model: User, as: 'assignedAgent', attributes: ['id', 'firstName', 'lastName'] }]
    });
    res.json(customers);
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
    const { firstName, lastName, email, phone, company, address, assignedAgentId, status, notes, name } = req.body;

    // Backward compatibility: if a single 'name' is provided, split into first/last
    let fName = firstName;
    let lName = lastName;
    if (name && (!firstName || !lastName)) {
      const parts = name.trim().split(' ');
      fName = parts[0] || '';
      lName = parts.slice(1).join(' ') || '';
    }

    // Uniqueness check for email and phone
    if (email || phone) {
      const existing = await Customer.findOne({
        where: {
          [Op.or]: [
            email ? { email } : null,
            phone ? { phone } : null
          ].filter(Boolean)
        }
      });
      if (existing) {
        return res.status(409).json({ message: 'Email or phone already exists' });
      }
    }

    const customer = await Customer.create({
      firstName: fName,
      lastName: lName,
      email,
      phone,
      company,
      address,
      assignedAgentId,
      status,
      notes
    });

    res.status(201).json(customer);
  } catch (error) {
    console.error(error);
    if (error && (error.name === 'SequelizeUniqueConstraintError' || error.original?.code === 'EREQUEST')) {
      return res.status(409).json({ message: 'Email or phone already exists' });
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

    const { firstName, lastName, name, email, phone, company, address, assignedAgentId, status, notes } = req.body;

    // Map single 'name' to first/last if provided
    let fName = firstName;
    let lName = lastName;
    if (name && (!firstName || !lastName)) {
      const parts = name.trim().split(' ');
      fName = parts[0] || '';
      lName = parts.slice(1).join(' ') || '';
    }

    // Uniqueness check for email and phone excluding current record
    if (email || phone) {
      const conflict = await Customer.findOne({
        where: {
          id: { [Op.ne]: req.params.id },
          [Op.or]: [
            email ? { email } : null,
            phone ? { phone } : null
          ].filter(Boolean)
        }
      });
      if (conflict) {
        return res.status(409).json({ message: 'Email or phone already exists' });
      }
    }

    // Update customer fields
    if (fName !== undefined) customer.firstName = fName;
    if (lName !== undefined) customer.lastName = lName;
    if (email) customer.email = email;
    if (phone !== undefined) customer.phone = phone;
    if (company !== undefined) customer.company = company;
    if (address !== undefined) customer.address = address;
    if (assignedAgentId !== undefined) customer.assignedAgentId = assignedAgentId;
    if (status) customer.status = status;
    if (notes !== undefined) customer.notes = notes;

    await customer.save();
    res.json(customer);
  } catch (error) {
    console.error(error);
    if (error && (error.name === 'SequelizeUniqueConstraintError' || error.original?.code === 'EREQUEST')) {
      return res.status(409).json({ message: 'Email or phone already exists' });
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

    await customer.destroy();
    res.json({ message: 'Customer removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};