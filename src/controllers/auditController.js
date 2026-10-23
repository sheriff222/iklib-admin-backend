// src/controllers/auditController.js — read audit log.
const asyncHandler = require('express-async-handler');
const prisma = require('../prisma');

exports.list = asyncHandler(async (req, res) => {
  const { action, actorId } = req.query;
  const where = {};
  if (action) where.action = { contains: action };
  if (actorId) where.actorId = actorId;
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { actor: { select: { name: true, role: true } } },
  });
  res.json({ success: true, logs });
});
