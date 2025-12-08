const jwt = require('jsonwebtoken');
const { User, Role, Session } = require('../models');

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

    // Check if session is active
    const session = await Session.findOne({
      where: {
        jwtToken: token,
        isActive: true,
        userId: decoded.id
      }
    });

    if (!session) {
      return res.status(401).json({ message: 'Session expired or invalid' });
    }

    // Enforce idle timeout of 30 minutes
    const IDLE_LIMIT_MS = 30 * 60 * 1000;
    const lastActivityMs = new Date(session.lastActivity).getTime();
    if (Date.now() - lastActivityMs > IDLE_LIMIT_MS) {
      await Session.update(
        { isActive: false },
        { where: { id: session.id } }
      );
      return res.status(401).json({ message: 'Session expired due to inactivity' });
    }

    // Check if session has expired
    if (new Date() > session.expiresAt) {
      await Session.update(
        { isActive: false },
        { where: { id: session.id } }
      );
      return res.status(401).json({ message: 'Session expired' });
    }

    // Update last activity
    await Session.update(
      { lastActivity: new Date() },
      { where: { id: session.id } }
    );

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

    // Grant Orders Viewer (roleId 1004) admin-equivalent access for report endpoints
    // This is intentionally scoped to /api/reports to avoid over-granting elsewhere
    if (roleId === 1004 && req && typeof req.originalUrl === 'string' && req.originalUrl.startsWith('/api/reports')) {
      return next();
    }

    return res.status(403).json({ message: 'User role not authorized to access this route' });
  };
};
