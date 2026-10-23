// src/controllers/authController.js — admin/staff auth: login, refresh, logout, me, setScope.
const asyncHandler = require('express-async-handler');
const { z } = require('zod');
const prisma = require('../prisma');
const { loginSchema } = require('../validation/schemas');
const {
  verifyPassword,
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeFamily,
  setRefreshCookie,
  clearRefreshCookie,
} = require('../utils/auth');
const { parseCookies } = require('../middleware/auth');
const env = require('../config/env');

function publicUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

function publicUserLink(link) {
  const { user, university, ...rest } = link;
  return {
    ...rest,
    university: university
      ? { id: university.id, name: university.name, code: university.code }
      : null,
  };
}

const setScopeSchema = z.object({
  universityId: z.string().min(1),
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  if (user.role === 'student') {
    return res.status(403).json({ success: false, message: 'Use the student app to sign in' });
  }

  // Get user's university memberships (for admins)
  const links = await prisma.userUniversity.findMany({
    where: { userId: user.id },
    include: { university: { select: { id: true, name: true, code: true, active: true } } },
  });
  const activeUniversities = links.filter((l) => l.university?.active);

  // Default to first university if they only belong to one
  const defaultUniversityId =
    activeUniversities.length === 1 ? activeUniversities[0].universityId : null;

  const accessToken = signAccessToken(user, { universityId: defaultUniversityId });
  const raw = await issueRefreshToken(user.id);
  setRefreshCookie(res, raw);

  res.json({
    success: true,
    accessToken,
    refreshToken: raw,
    user: publicUser(user),
    universities: activeUniversities.map(publicUserLink),
    activeUniversityId: defaultUniversityId,
  });
});

exports.refresh = asyncHandler(async (req, res) => {
  const cookies = parseCookies(req);
  // Flutter stores the refresh token in secure storage and sends it in the
  // request body. Keep cookie support for browser clients.
  const raw = cookies[env.REFRESH_TOKEN_COOKIE_NAME] || req.body?.refreshToken;
  if (!raw) return res.status(401).json({ success: false, message: 'No refresh token' });
  try {
    const { raw: newRaw, userId } = await rotateRefreshToken(raw);
    setRefreshCookie(res, newRaw);
    const user = await prisma.user.findUnique({ where: { id: userId } });

    // Re-establish scope: pick first university if only one, else null
    const links = await prisma.userUniversity.findMany({
      where: { userId },
      include: { university: { select: { id: true, name: true, code: true, active: true } } },
    });
    const activeUniversities = links.filter((l) => l.university?.active);
    const defaultUniversityId =
      activeUniversities.length === 1 ? activeUniversities[0].universityId : null;

    const accessToken = signAccessToken(user, { universityId: defaultUniversityId });
    res.json({
      success: true,
      accessToken,
      refreshToken: newRaw,
      user: publicUser(user),
      universities: activeUniversities.map(publicUserLink),
      activeUniversityId: defaultUniversityId,
    });
  } catch (e) {
    clearRefreshCookie(res);
    return res.status(401).json({ success: false, message: e.message });
  }
});

exports.logout = asyncHandler(async (req, res) => {
  const cookies = parseCookies(req);
  const raw = cookies[env.REFRESH_TOKEN_COOKIE_NAME] || req.body?.refreshToken;
  if (raw) {
    const crypto = require('crypto');
    const rec = await prisma.refreshToken.findUnique({
      where: { tokenHash: crypto.createHash('sha256').update(raw).digest('hex') },
    });
    if (rec) await revokeFamily(rec.familyId);
  }
  clearRefreshCookie(res);
  res.json({ success: true, message: 'Logged out' });
});

exports.me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const links = await prisma.userUniversity.findMany({
    where: { userId: user.id },
    include: { university: { select: { id: true, name: true, code: true, active: true } } },
  });
  const activeUniversities = links.filter((l) => l.university?.active);

  res.json({
    success: true,
    user: publicUser(user),
    universities: activeUniversities.map(publicUserLink),
    activeUniversityId: req.user.universityId || null,
  });
});

// Switch the active university scope and re-issue the access token
exports.setScope = asyncHandler(async (req, res) => {
  const { universityId } = setScopeSchema.parse(req.body);

  // Verify user has membership in this university
  const link = await prisma.userUniversity.findUnique({
    where: { universityId_userId: { universityId, userId: req.user.id } },
    include: { university: { select: { id: true, name: true, code: true, active: true } } },
  });

  if (!link || !link.university?.active) {
    return res.status(403).json({ success: false, message: 'Not a member of this university' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const accessToken = signAccessToken(user, { universityId });

  res.json({
    success: true,
    accessToken,
    activeUniversityId: universityId,
    university: publicUserLink(link).university,
  });
});
