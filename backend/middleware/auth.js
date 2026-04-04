const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');

// Verify JWT token
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, name, email, role, branch_id }
    next();
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401));
  }
}

// Role-based access control
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Authentication required', 401));
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    next();
  };
}

// Branch filter — non-admin users can only see their branch data
function branchFilter(req, res, next) {
  if (req.user.role !== 'admin' && req.user.branch_id) {
    req.branchId = req.user.branch_id;
  } else {
    req.branchId = req.query.branch_id ? parseInt(req.query.branch_id) : null;
  }
  next();
}

module.exports = { authenticate, authorize, branchFilter };
