// src/utils/notify.js — in-app notifications (real rows, real recipients).
const prisma = require('../prisma');

async function createNotification(userId, message, relatedType = null, relatedId = null, tx = prisma) {
  if (!userId) return null;
  return tx.notification.create({ data: { userId, message, relatedType, relatedId } });
}

// Notify every user who bookmarked a paper in the given hierarchy level.
async function notifyBookmarked(hierarchyLevelId, message, relatedId, tx = prisma) {
  const byNode = await tx.bookmark.findMany({
    where: { examPaper: { hierarchyLevelId } },
    select: { userId: true },
    distinct: ['userId'],
  });
  if (!byNode.length) return 0;
  const ids = byNode.map((b) => b.userId);
  await tx.notification.createMany({
    data: ids.map((userId) => ({ userId, message, relatedType: 'exam_paper', relatedId })),
  });
  return ids.length;
}

module.exports = { createNotification, notifyBookmarked };
