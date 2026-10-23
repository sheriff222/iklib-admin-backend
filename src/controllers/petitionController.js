// src/controllers/petitionController.js — admin petition queue.
const asyncHandler = require('express-async-handler');
const prisma = require('../prisma');
const { createNotification } = require('../utils/notify');
const { awardPoints } = require('../utils/points');
const { logAudit } = require('../utils/audit');

exports.list = asyncHandler(async (req, res) => {
  const { status, universityId } = req.query;
  const where = { status: status || 'open' };
  if (universityId) where.universityId = universityId;

  const petitions = await prisma.petition.findMany({
    where,
    include: {
      user: { select: { id: true, name: true } },
      hierarchyLevel: { select: { id: true, name: true, levelType: { select: { name: true } } } },
      university: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ success: true, petitions });
});

async function decide(req, res, decision) {
  const p = await prisma.petition.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ success: false, message: 'Not found' });
  if (p.status !== 'open') return res.status(409).json({ success: false, message: 'Already decided' });
  await prisma.$transaction(async (tx) => {
    await tx.petition.update({ where: { id: p.id }, data: { status: decision, handledById: req.user.id } });
    if (decision === 'fulfilled') {
      await awardPoints(p.userId, 'petitionFulfilled', tx);
      await createNotification(p.userId, 'Good news — a past paper matching your petition is now available!', 'petition', p.id, tx);
    } else {
      await createNotification(p.userId, 'Your petition could not be fulfilled at this time.', 'petition', p.id, tx);
    }
    await logAudit({
      actorId: req.user.id, actorRole: req.user.role,
      action: `petition.${decision}`, targetType: 'petition', targetId: p.id,
      meta: { userId: p.userId },
    }, tx);
  });
  res.json({ success: true, decision });
}

exports.fulfill = asyncHandler((req, res) => decide(req, res, 'fulfilled'));
exports.reject = asyncHandler((req, res) => decide(req, res, 'rejected'));
