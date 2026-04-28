const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  // Get token from header
  const token = req.header('x-auth-token');

  // Check if no token
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  // Verify token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Reject temporary MFA tokens — they are only valid for /mfa/verify
    if (decoded.isTemp) {
      return res.status(401).json({ msg: 'MFA verification required. Complete MFA before accessing this resource.' });
    }

    req.user = decoded.user; // Attach user id to the request
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};