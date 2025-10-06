const jwt = require('jsonwebtoken');
const { User } = require('../models');

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

// Check user role
exports.authorize = (...roles) => {
  return async (req, res, next) => {
    // Get user role
    const user = await User.findByPk(req.user.id, {
      include: 'Role'
    });

    if (!user || !roles.includes(user.Role.name)) {
      return res.status(403).json({ message: 'User role not authorized to access this route' });
    }

    next();
  };
};