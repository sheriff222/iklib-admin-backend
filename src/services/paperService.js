// src/services/paperService.js — publish extracted drafts into real ExamPapers.
// Updated to use the HierarchyLevel model instead of School/Department/Module.
const prisma = require('../prisma');
const { getEmbedding } = require('../utils/embeddings');
const { awardPoints } = require('../utils/points');
const { notifyBookmarked } = require('../utils/notify');
const { logAudit } = require('../utils/audit');
const { setParts } = require('./questionPartService');
const { generateAnswersForQuestions } = require('./aiAnswerService');
const env = require('../config/env');

function vecLiteral(vec) {
  return '[' + vec.join(',') + ']';
}

// Same-hierarchy-node similar questions (semantic), for duplicate flagging.
async function findSimilar(hierarchyLevelId, embedding, paperId, threshold, tx = prisma) {
  if (!embedding) return [];
  const lit = vecLiteral(embedding);
  const rows = await tx.$queryRaw`
    SELECT q."id", q."text", 1 - (q."embedding" <=> ${lit}::vector) AS similarity
    FROM "Question" q
    WHERE q."hierarchyLevelId" = ${hierarchyLevelId} AND q."examPaperId" <> ${paperId}
    ORDER BY q."embedding" <=> ${lit}::vector
    LIMIT 10`;
  return rows.filter((r) => (r.similarity ?? 0) >= threshold && r.similarity != null);
}

// Publish: create ExamPaper + Questions, embed each, flag duplicates, notify, award, audit.
exports.publishPaper = async function publishPaper({ data, reviewerId, uploaderId }) {
  const result = await prisma.$transaction(async (tx) => {
    const hierarchyNode = await tx.hierarchyLevel.findUnique({
      where: { id: data.hierarchyLevelId },
      include: { levelType: true },
    });
    if (!hierarchyNode) throw Object.assign(new Error('Hierarchy level not found'), { code: 'NOT_FOUND' });

    const paper = await tx.examPaper.create({
      data: {
        title: data.title,
        hierarchyName: hierarchyNode.name,
        hierarchyLevelId: data.hierarchyLevelId,
        universityId: data.universityId,
        year: data.year,
        examType: data.examType || 'Final',
        semester: data.semester || null,
        duration: data.duration,
        instructions: data.instructions,
        fileKeys: data.fileKeys || [],
        fileUrls: data.fileUrls || [],
        status: 'published',
        publishedAt: new Date(),
        uploadedById: uploaderId || null,
        reviewedById: reviewerId,
        // Template fields
        examDate: data.examDate ? new Date(data.examDate) : null,
        totalMarks: data.totalMarks ?? null,
        sectionHeaders: data.sectionHeaders ?? null,
        numberingStyle: data.numberingStyle || 'Q1',
        questions: {
          create: (data.questions || []).map((q, i) => ({
            text: q.text,
            marks: q.marks ?? null,
            order: i,
            hierarchyLevelId: data.hierarchyLevelId,
            universityId: data.universityId,
            source: q.source || 'manual',
            generateAiAnswer: q.generateAiAnswer === true,
          })),
        },
      },
      include: { questions: true },
    });

    // Persist sub-parts (questions now have IDs).
    for (let i = 0; i < paper.questions.length; i++) {
      const q = paper.questions[i];
      const source = (data.questions || [])[i];
      if (source && Array.isArray(source.parts) && source.parts.length) {
        await setParts(q.id, source.parts, tx);
      }
    }

    const duplicates = [];
    for (const q of paper.questions) {
      try {
        const emb = await getEmbedding(q.text, 'RETRIEVAL_DOCUMENT');
        await tx.question.update({ where: { id: q.id }, data: { embedding: '[' + emb.join(',') + ']' } });
        const sim = await findSimilar(data.hierarchyLevelId, emb, paper.id, env.SEMANTIC_MIN_SCORE, tx);
        if (sim.length) duplicates.push({ questionId: q.id, text: q.text, matches: sim });
      } catch (e) {
        console.warn('[publish] embed failed for', q.id, e.message);
      }
    }
    if (duplicates.length) {
      await tx.examPaper.update({ where: { id: paper.id }, data: { duplicateFlag: true } });
    }

    if (uploaderId) {
      await awardPoints(uploaderId, 'uploadPublished', tx);
    }

    const notified = await notifyBookmarked(
      data.hierarchyLevelId,
      `New past paper published: ${hierarchyNode.name} (${data.year} ${data.examType || ''})`,
      paper.id,
      tx
    );

    if (data.rawDraftId) {
      await tx.aiExtractionDraft
        .update({ where: { id: data.rawDraftId }, data: { status: 'published' } })
        .catch(() => {});
    }

    await logAudit({
      actorId: reviewerId,
      actorRole: (await tx.user.findUnique({ where: { id: reviewerId }, select: { role: true } })).role,
      action: 'paper.publish',
      targetType: 'exam_paper',
      targetId: paper.id,
      meta: {
        hierarchyLevelId: data.hierarchyLevelId,
        questions: paper.questions.length,
        duplicates: duplicates.length,
        notified,
      },
    }, tx);

    return { paper, duplicates, answerItems: (data.questions || [])
        .filter((q) => q.generateAiAnswer)
        .map((q, i) => ({ questionId: paper.questions[i]?.id, text: q.text }))
        .filter((it) => it.questionId) };
  });

  // After transaction commits — run AI answer jobs in background.
  if (result.answerItems && result.answerItems.length) {
    generateAnswersForQuestions(result.answerItems).then((results) => {
      const ok = results.filter((r) => r.status === 'ok').length;
      const failed = results.length - ok;
      console.log(`[publish] AI answers: ${ok} ok, ${failed} failed (paper ${result.paper.id})`);
    }).catch((e) => console.error('[publish] AI answer job error', e));
  }

  return { paper: result.paper, duplicates: result.duplicates };
};

// List published papers with optional filters.
exports.listPapers = async function listPapers({
  universityId,
  hierarchyLevelId,
  year,
  examType,
  take = 50,
}) {
  const where = { status: 'published' };
  if (universityId) where.universityId = universityId;
  if (hierarchyLevelId) where.hierarchyLevelId = hierarchyLevelId;
  if (year) where.year = parseInt(year, 10);
  if (examType) where.examType = examType;
  return prisma.examPaper.findMany({
    where,
    include: {
      hierarchyLevel: {
        select: { id: true, name: true, levelType: { select: { name: true } } },
      },
      _count: { select: { questions: true, bookmarks: true } },
    },
    orderBy: { publishedAt: 'desc' },
    take: parseInt(take, 10),
  });
};

exports.getPaper = async function getPaper(id) {
  return prisma.examPaper.findUnique({
    where: { id },
    include: {
      hierarchyLevel: {
        include: { levelType: true },
      },
      questions: { orderBy: { order: 'asc' }, include: { parts: { orderBy: { order: 'asc' } } } },
      uploadedBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
    },
  });
};
