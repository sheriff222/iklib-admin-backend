// src/services/questionPartService.js — sub-part CRUD for Question rows.
const prisma = require('../prisma');

/** Replace all sub-parts for a question with the given list. */
async function setParts(questionId, parts, tx = prisma) {
  if (!Array.isArray(parts)) return [];
  await tx.questionPart.deleteMany({ where: { questionId } });
  if (parts.length === 0) return [];
  return tx.questionPart.createMany({
    data: parts.map((p, i) => ({
      questionId,
      partLabel: p.partLabel ?? null,
      text: p.text,
      marks: p.marks ?? null,
      order: typeof p.order === 'number' ? p.order : i,
    })),
  });
}

/** Get sub-parts for a single question, ordered. */
async function getParts(questionId, tx = prisma) {
  return tx.questionPart.findMany({
    where: { questionId },
    orderBy: { order: 'asc' },
  });
}

/** Batch-fetch sub-parts for many questions, keyed by questionId. */
async function getPartsForQuestions(questionIds, tx = prisma) {
  if (!questionIds || questionIds.length === 0) return {};
  const rows = await tx.questionPart.findMany({
    where: { questionId: { in: questionIds } },
    orderBy: { order: 'asc' },
  });
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.questionId]) grouped[r.questionId] = [];
    grouped[r.questionId].push(r);
  }
  return grouped;
}

module.exports = { setParts, getParts, getPartsForQuestions };
