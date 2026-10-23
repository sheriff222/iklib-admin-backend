// src/middleware/auth.js — auth/role guards with university scoping.
// requireAuth attaches req.user = { id, role, universityId, vs }
// universityId is set when the user picks an active university scope.
// super_admin bypasses university scoping.
const asyncHandler = require('express-async-handler');
const { verifyAccessToken } = require('../utils/auth');

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(';').reduce((acc, part) => {
    const i = part.indexOf('=');
    if (i > -1) acc[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    return acc;
  }, {});
}

// Attach req.user from the Bearer access token.
// universityId is optional — set it via requireUniversityScope or by the auth controller.
function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      id: decoded.id,
      role: decoded.role,
      universityId: decoded.universityId || null,
      vs: decoded.vs,
    };
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

// Middleware factory: ensure the request targets the correct university.
// Denies non-super_admin users who have a universityId mismatch.
// If no universityId is set on req.user yet, it reads it from req.body / req.query / req.params.
// For route params like :universityId it uses req.params first.
function requireUniversityScope(paramKey) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    // super_admin bypasses tenant scoping
    if (req.user.role === 'super_admin') return next();

    // Resolve the universityId this request is about
    const targetUniversityId =
      req.user.universityId ||
      req.params.universityId ||
      req.body?.universityId ||
      req.query?.universityId ||
      (paramKey ? req.params[paramKey] : null);

    if (!targetUniversityId) {
      return res.status(400).json({
        success: false,
        message: 'University ID required. Set universityId in the active scope.',
        code: 'UNIVERSITY_REQUIRED',
      });
    }

    if (req.user.universityId && req.user.universityId !== targetUniversityId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this university',
        code: 'UNIVERSITY_FORBIDDEN',
      });
    }

    // Attach the resolved universityId so controllers can use it without re-extracting
    req.universityId = targetUniversityId;
    next();
  };
}

// Requires verificationStatus === 'verified'.
function requireVerified(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
  if (req.user.vs !== 'verified') {
    return res.status(403).json({ success: false, message: 'Account not verified', code: 'UNVERIFIED' });
  }
  next();
}

// requireRole('admin','super_admin') — passes if user role is in the list.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
}

// Async-wrapped variant for routers that use express-async-handler.
const requireAuthA = asyncHandler(requireAuth);

module.exports = {
  parseCookies,
  requireAuth,
  requireUniversityScope,
  requireVerified,
  requireRole,
  requireAuthA,
};
