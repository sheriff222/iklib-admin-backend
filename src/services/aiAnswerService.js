// src/services/aiAnswerService.js — generate AI answers for question rows.
const prisma = require('../prisma');
const { generateText } = require('../utils/gemini');

const ANSWER_PROMPT = `You are a helpful teaching assistant.
Answer the following exam question clearly and step by step.
Question: """
{text}
"""
Answer:`;

/** Generate and persist an AI answer for one question. */
async function generateAnswerForQuestion(questionId, questionText) {
  try {
    const raw = await generateText(
      ANSWER_PROMPT.replace('{text}', questionText),
      { responseMimeType: 'text/plain' }
    );
    const created = await prisma.aiAnswer.create({
      data: {
        questionId,
        content: raw,
        isAiGenerated: true,
        modelVersion: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      },
    });
    return { questionId, answerId: created.id, status: 'ok' };
  } catch (err) {
    console.warn('[aiAnswer] failed for', questionId, err.message);
    return { questionId, status: 'failed', error: err.message };
  }
}

/** Generate AI answers for many questions. Never throws — returns results array. */
async function generateAnswersForQuestions(items) {
  const promises = items.map((it) =>
    generateAnswerForQuestion(it.questionId, it.text)
  );
  return Promise.all(promises);
}

module.exports = { generateAnswerForQuestion, generateAnswersForQuestions };
