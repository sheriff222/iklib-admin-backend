// src/utils/auth.js — password hashing + JWT access tokens + refresh rotation/revocation.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const env = require('../config/env');
const prisma = require('../prisma');

const ROLES = ['student', 'sub_admin', 'admin', 'super_admin'];
const ROLE_RANK = { student: 0, sub_admin: 1, admin: 2, super_admin: 3 };

function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}
function verifyPassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

// Access token: short-lived, carries identity + role + verification status + universityId.
// universityId is the *active* scope (which university the user is currently operating in).
// super_admin may carry null here and pick per-request via requireUniversityScope.
function signAccessToken(user, { universityId = null } = {}) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      vs: user.verificationStatus,
      universityId: universityId || null,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRY, algorithm: 'HS256' }
  );
}
function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function refreshExpiry() {
  // REFRESH_TOKEN_EXPIRY like '7d' → compute ms via a tiny parser.
  const m = env.REFRESH_TOKEN_EXPIRY.match(/^(\d+)([dhm])$/);
  const mult = { d: 864e5, h: 36e5, m: 6e4 }[m ? m[2] : 'd'];
  const n = m ? parseInt(m[1], 10) : 7;
  return new Date(Date.now() + n * mult);
}

// Create a brand-new refresh token (new family). Returns the RAW token to set as cookie.
async function issueRefreshToken(userId) {
  const raw = crypto.randomBytes(40).toString('hex');
  const familyId = crypto.randomBytes(20).toString('hex');
  await prisma.refreshToken.create({
    data: { userId, tokenHash: sha256(raw), familyId, expiresAt: refreshExpiry() },
  });
  return raw;
}

// Rotate: verify the presented raw token, revoke it, and issue a new one in the SAME
// family. If the presented token is already revoked (reuse detection) we nuke the
// whole family (logout everywhere).
async function rotateRefreshToken(raw) {
  const rec = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!rec) throw new Error('Invalid refresh token');
  if (rec.revoked) {
    // Reuse of a rotated/revoked token → revoke the entire family.
    await prisma.refreshToken.updateMany({ where: { familyId: rec.familyId }, data: { revoked: true } });
    throw new Error('Refresh token reused — session revoked');
  }
  if (rec.expiresAt < new Date()) throw new Error('Refresh token expired');
  const newRaw = crypto.randomBytes(40).toString('hex');
  await prisma.refreshToken.update({ where: { id: rec.id }, data: { revoked: true } });
  await prisma.refreshToken.create({
    data: { userId: rec.userId, tokenHash: sha256(newRaw), familyId: rec.familyId, expiresAt: refreshExpiry() },
  });
  return { raw: newRaw, userId: rec.userId };
}

async function revokeFamily(familyId) {
  await prisma.refreshToken.updateMany({ where: { familyId }, data: { revoked: true } });
}

// Set the refresh cookie on a response.
function setRefreshCookie(res, raw) {
  res.cookie(env.REFRESH_TOKEN_COOKIE_NAME, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 864e5,
  });
}
function clearRefreshCookie(res) {
  res.clearCookie(env.REFRESH_TOKEN_COOKIE_NAME, { path: '/' });
}

function hasRole(user, roles) {
  return roles.includes(user.role);
}
function atLeast(userRole, minRole) {
  return (ROLE_RANK[userRole] || 0) >= (ROLE_RANK[minRole] || 0);
}

module.exports = {
  ROLES,
  ROLE_RANK,
  hashPassword,
  verifyPassword,
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeFamily,
  setRefreshCookie,
  clearRefreshCookie,
  hasRole,
  atLeast,
};
