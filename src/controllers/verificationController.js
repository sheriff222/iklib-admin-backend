// src/controllers/verificationController.js — admin verification queue.
const asyncHandler = require('express-async-handler');
const { parse } = require('csv-parse/sync');
const prisma = require('../prisma');
const { createNotification } = require('../utils/notify');
const { logAudit } = require('../utils/audit');

exports.list = asyncHandler(async (req, res) => {
  const status = req.query.status || 'pending';
  const requests = await prisma.verificationRequest.findMany({
    where: { status },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          schoolIdNumber: true,
          universityLinks: {
            select: {
              university: { select: { name: true, code: true } },
              schoolIdNumber: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ success: true, requests });
});

async function decide(req, res, decision) {
  const id = req.params.id;
  const vr = await prisma.verificationRequest.findUnique({ where: { id } });
  if (!vr) return res.status(404).json({ success: false, message: 'Request not found' });
  if (vr.status !== 'pending') {
    return res.status(409).json({ success: false, message: 'Request already decided' });
  }
  await prisma.$transaction(async (tx) => {
    await tx.verificationRequest.update({
      where: { id },
      data: { status: decision, reviewedById: req.user.id, reviewedAt: new Date() },
    });
    if (decision === 'approved') {
      await tx.user.update({ where: { id: vr.userId }, data: { verificationStatus: 'verified' } });
      await createNotification(vr.userId, 'Your Iklib account has been verified. Full access unlocked!', 'verification', vr.id, tx);
    } else {
      await tx.user.update({ where: { id: vr.userId }, data: { verificationStatus: 'unverified' } });
      await createNotification(vr.userId, 'Your verification request was rejected. Please review and resubmit.', 'verification', vr.id, tx);
    }
    await logAudit({ actorId: req.user.id, actorRole: req.user.role, action: `verification.${decision}`, targetType: 'verification_request', targetId: id, meta: { userId: vr.userId } }, tx);
  });
  res.json({ success: true, decision });
}

exports.approve = asyncHandler((req, res) => decide(req, res, 'approved'));
exports.reject = asyncHandler((req, res) => decide(req, res, 'rejected'));

// Bulk verify: CSV of valid school_id_numbers → matching PENDING users auto-verify.
// Looks up users by their UserUniversity.schoolIdNumber.
exports.bulk = asyncHandler(async (req, res) => {
  const csv = req.body && req.body.csv;
  if (typeof csv !== 'string' || !csv.trim()) {
    return res.status(400).json({ success: false, message: 'CSV text required (header optional, one school_id_number per line)' });
  }
  const rows = parse(csv, { skip_empty_lines: true }).flat().map((s) => String(s).trim()).filter(Boolean);
  const numbers = rows.filter((r) => /^\d{2}\/[A-Za-z]+\/[A-Za-z]+\/\d+$/.test(r));
  if (numbers.length === 0) {
    return res.status(400).json({ success: false, message: 'No valid school_id_numbers found' });
  }
  // Find users via their UserUniversity links
  const links = await prisma.userUniversity.findMany({
    where: { schoolIdNumber: { in: numbers }, user: { verificationStatus: 'pending' } },
    include: { user: true },
  });
  let verified = 0;
  await prisma.$transaction(async (tx) => {
    for (const link of links) {
      const u = link.user;
      await tx.user.update({ where: { id: u.id }, data: { verificationStatus: 'verified' } });
      await tx.verificationRequest.updateMany({ where: { userId: u.id, status: 'pending' }, data: { status: 'approved', reviewedById: req.user.id, reviewedAt: new Date() } });
      await createNotification(u.id, 'Your Iklib account has been verified (bulk). Full access unlocked!', 'verification', null, tx);
      verified++;
    }
    await logAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'verification.bulk', targetType: 'user', targetId: null, meta: { submitted: numbers.length, verified } }, tx);
  });
  res.json({ success: true, submitted: numbers.length, verified, unmatched: numbers.length - verified });
});

exports.pendingCount = asyncHandler(async (req, res) => {
  const count = await prisma.verificationRequest.count({ where: { status: 'pending' } });
  res.json({ success: true, count });
});
