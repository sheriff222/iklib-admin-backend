// src/controllers/userController.js — staff/user management (super_admin).
const asyncHandler = require('express-async-handler');
const prisma = require('../prisma');
const { createUserSchema } = require('../validation/schemas');
const { hashPassword, revokeFamily, ROLE_RANK } = require('../utils/auth');
const { logAudit } = require('../utils/audit');

function parseSchoolId(id) {
  const parts = id.split('/');
  return {
    admissionYear: 2000 + parseInt(parts[0], 10),
    idNumber: parts[parts.length - 1],
  };
}

exports.list = asyncHandler(async (req, res) => {
  const { role, universityId } = req.query;
  const where = {};
  if (role) where.role = role;
  if (universityId) {
    where.universityLinks = { some: { universityId } };
  }
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, name: true, email: true, role: true,
      verificationStatus: true, points: true, createdAt: true,
      universityLinks: {
        where: universityId ? { universityId } : {},
        include: {
          university: { select: { name: true, code: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, users });
});

exports.create = asyncHandler(async (req, res) => {
  const body = createUserSchema.parse(req.body);

  // Check email uniqueness
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

  // For staff, we also check if the schoolIdNumber is already linked to this university
  const linkExists = await prisma.userUniversity.findUnique({
    where: { universityId_schoolIdNumber: { universityId: body.universityId, schoolIdNumber: body.schoolIdNumber } },
  });
  if (linkExists) return res.status(409).json({ success: false, message: 'School ID already linked to this university' });

  const parsed = parseSchoolId(body.schoolIdNumber);
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      contact: body.contact,
      passwordHash: await hashPassword(body.password),
      role: body.role,
      universityLinks: {
        create: {
          universityId: body.universityId,
          schoolIdNumber: body.schoolIdNumber,
          admissionYear: body.admissionYear || parsed.admissionYear,
          idNumber: body.idNumber || parsed.idNumber,
          role: body.role,
          isPrimaryAdmin: body.role === 'admin' ? true : undefined,
        },
      },
    },
    include: { universityLinks: { include: { university: true } } },
  });

  await logAudit({
    actorId: req.user.id, actorRole: req.user.role,
    action: 'admin.create', targetType: 'user', targetId: user.id,
    meta: { role: body.role, universityId: body.universityId },
  });

  res.status(201).json({
    success: true,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      universityLinks: user.universityLinks,
    },
  });
});

exports.setRole = asyncHandler(async (req, res) => {
  const { role, universityId } = req.body;
  if (!['student', 'sub_admin', 'admin', 'super_admin'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Invalid role' });
  }

  // If universityId is provided, update the role in that university only
  if (universityId) {
    const link = await prisma.userUniversity.findUnique({
      where: { universityId_userId: { universityId, userId: req.params.id } },
    });
    if (!link) return res.status(404).json({ success: false, message: 'Not found in this university' });

    const updated = await prisma.userUniversity.update({
      where: { universityId_userId: { universityId, userId: req.params.id } },
      data: { role },
    });
    await logAudit({
      actorId: req.user.id, actorRole: req.user.role,
      action: 'admin.role', targetType: 'user_university', targetId: updated.id,
      meta: { role, universityId },
    });
    return res.json({ success: true, userUniversity: updated });
  }

  // Fallback: update platform-level role
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { role } });
  await logAudit({
    actorId: req.user.id, actorRole: req.user.role,
    action: 'admin.role', targetType: 'user', targetId: user.id, meta: { role },
  });
  res.json({ success: true, user: { id: user.id, role: user.role } });
});

exports.remove = asyncHandler(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ success: false, message: 'Not found' });
  if (ROLE_RANK[target.role] >= ROLE_RANK[req.user.role]) {
    return res.status(403).json({ success: false, message: 'Cannot delete a peer or superior role' });
  }
  await prisma.refreshToken.updateMany({ where: { userId: target.id }, data: { revoked: true } });
  await prisma.user.delete({ where: { id: target.id } });
  await logAudit({
    actorId: req.user.id, actorRole: req.user.role,
    action: 'admin.delete', targetType: 'user', targetId: target.id,
  });
  res.json({ success: true, message: 'User deleted' });
});
