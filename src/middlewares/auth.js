const jwt = require('jsonwebtoken');

/**
 * verifyToken
 * Validates the Bearer token in the Authorization header.
 * Attaches the decoded payload to req.user on success.
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token      = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;   // { id, name, email, role, iat, exp }
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Token has expired.'
      : 'Invalid token.';
    return res.status(401).json({ success: false, message });
  }
};

/**
 * authorizeRoles(...roles)
 * Factory that returns middleware allowing only the specified roles.
 *
 * Usage:  router.get('/admin-only', verifyToken, authorizeRoles('Admin'), handler)
 */
const authorizeRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Requires one of: ${roles.join(', ')}.`,
    });
  }
  next();
};

module.exports = { verifyToken, authorizeRoles };
