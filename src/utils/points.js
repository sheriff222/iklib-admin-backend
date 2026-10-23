// src/utils/points.js — single source of truth for points + badge tiers.
// Every point value and badge threshold lives here (no scattered constants).
const prisma = require('../prisma');

const POINT_VALUES = {
  uploadPublished: 10, // a volunteered/uploaded paper goes live
  commentHelpful: 2, // a comment marked "helpful" by a reader
  upvoteReceived: 1, // an answer/comment upvoted
  quizTaken: 3, // completed a quiz
  petitionFulfilled: 2, // a petition the user filed gets fulfilled
};

const BADGE_TIERS = [
  { name: 'Contributor', minPoints: 10, minUploads: 1 },
  { name: 'Top Contributor', minPoints: 50, minUploads: 5 },
  { name: 'Department Champion', minPoints: 100, minUploads: 10 },
];

// Increment a user's points for an action. Accepts an optional tx (Prisma transaction).
async function awardPoints(userId, action, tx = prisma) {
  const delta = POINT_VALUES[action];
  if (!delta) return null;
  return tx.user.update({ where: { id: userId }, data: { points: { increment: delta } } });
}

// Compute which badges a user currently qualifies for.
async function computeBadges(userId, tx = prisma) {
  const [user, uploadCount] = await Promise.all([
    tx.user.findUnique({ where: { id: userId }, select: { points: true } }),
    tx.examPaper.count({ where: { uploadedById: userId, status: 'published' } }),
  ]);
  if (!user) return [];
  return BADGE_TIERS.filter(
    (b) => user.points >= b.minPoints && uploadCount >= b.minUploads
  ).map((b) => b.name);
}

module.exports = { POINT_VALUES, BADGE_TIERS, awardPoints, computeBadges };
