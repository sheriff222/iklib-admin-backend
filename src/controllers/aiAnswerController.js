// src/controllers/aiAnswerController.js — trigger AI answer generation for published questions.
const asyncHandler = require('express-async-handler');
const prisma = require('../prisma');
const { generateAnswersSchema } = require('../validation/schemas');
const { generateAnswersForQuestions } = require('../services/aiAnswerService');

// POST /api/papers/generate-answers { questionIds: string[] }
exports.generateAnswers = asyncHandler(async (req, res) => {
  const { questionIds } = generateAnswersSchema.parse(req.body);
  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds } },
    select: { id: true, text: true },
  });
  if (questions.length === 0) {
    return res.status(404).json({ success: false, message: 'No questions found' });
  }
  // Fire-and-forget: respond immediately, run jobs in background.
  generateAnswersForQuestions(questions).then((results) => {
    const ok = results.filter((r) => r.status === 'ok').length;
    const failed = results.length - ok;
    console.log(`[generate-answers] ${ok} ok, ${failed} failed`);
  }).catch((e) => console.error('[generate-answers] job error', e));
  res.json({ success: true, queued: questions.length });
});
