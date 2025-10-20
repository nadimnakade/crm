const jwt = require('jsonwebtoken');
const { User, Role } = require('../models');

// Protect routes
exports.protect = async (req, res, next) => {
  let token;

  // Check if token exists in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Check if token exists
  if (!token) {
    return res.status(401).json({ message: 'Not authorized to access this route' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');

    // Get user from token
    const user = await User.findByPk(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized to access this route' });
  }
};

// Check user role with case-insensitive matching, wildcard permission, and roleId fallback
exports.authorize = (...roles) => {
  return async (req, res, next) => {
    // Get user with role
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Role }]
    });

    const allowed = roles.map(r => `${r}`.toLowerCase());
    const userRoleName = (user && user.Role && user.Role.name) ? user.Role.name.toLowerCase() : '';
    const permissions = (user && user.Role && Array.isArray(user.Role.permissions)) ? user.Role.permissions : [];
    const roleId = (user && user.Role && user.Role.id) ? Number(user.Role.id) : Number(user && user.roleId);

    // Allow if role name matches (case-insensitive)
    if (user && user.Role && allowed.includes(userRoleName)) {
      return next();
    }
    console.log(user)
    console.log(userRoleName)
    console.log(permissions)
    console.log(roleId)
    // Allow if wildcard permission present (Super Admin style)
    if (permissions.includes('*')) {
      return next();
    }
    // Allow specific role IDs (e.g., 1=Admin, 2=Super Admin)
    if ([1, 2].includes(roleId)) {
      return next();
    }

    return res.status(403).json({ message: 'User role not authorized to access this route' });
  };
};