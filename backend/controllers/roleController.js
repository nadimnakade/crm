const { Role } = require('../models');
// Static permissions catalog for UI (adjust as needed)
const PERMISSIONS = [
  { id: 'manage_users', name: 'Manage Users' },
  { id: 'manage_roles', name: 'Manage Roles' },
  { id: 'manage_customers', name: 'Manage Customers' },
  { id: 'manage_calls', name: 'Manage Calls' },
  { id: 'view_reports', name: 'View Reports' },
  { id: 'system_config', name: 'System Configuration' },
  { id: 'data_export', name: 'Data Export' },
  { id: 'data_import', name: 'Data Import' }
];

// @desc    Get all roles
// @route   GET /api/roles
// @access  Private
exports.getRoles = async (req, res) => {
  try {
    const roles = await Role.findAll();
    res.json(roles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Get available permissions
// @route   GET /api/roles/permissions
// @access  Private
exports.getPermissions = async (_req, res) => {
  try {
    res.json(PERMISSIONS);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Get role by ID
// @route   GET /api/roles/:id
// @access  Private
exports.getRoleById = async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.id);

    if (role) {
      res.json(role);
    } else {
      res.status(404).json({ message: 'Role not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Create a role
// @route   POST /api/roles
// @access  Private/Admin
exports.createRole = async (req, res) => {
  try {
    const { name, description, permissions } = req.body;

    const roleExists = await Role.findOne({ where: { name } });
    if (roleExists) {
      return res.status(400).json({ message: 'Role already exists' });
    }

    const role = await Role.create({
      name,
      description,
      permissions
    });

    res.status(201).json(role);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Update a role
// @route   PUT /api/roles/:id
// @access  Private/Admin
exports.updateRole = async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.id);

    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    const { name, description, permissions } = req.body;

    // Update role fields
    if (name) role.name = name;
    if (description) role.description = description;
    if (permissions) role.permissions = permissions;
    // level field removed; ignore if provided

    await role.save();
    res.json(role);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Delete a role
// @route   DELETE /api/roles/:id
// @access  Private/Admin
exports.deleteRole = async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.id);

    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    await role.destroy();
    res.json({ message: 'Role removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};