// src/controllers/paperDraftController.js — save/load drafts during editing.
const asyncHandler = require('express-async-handler');
const prisma = require('../prisma');
const { draftSchema } = require('../validation/schemas');
const { logAudit } = require('../utils/audit');

exports.saveDraft = asyncHandler(async (req, res) => {
  const parsed = draftSchema.parse(req.body || {});
  const {
    id, title, semester, universityId, hierarchyLevelId,
    year, examType, duration, instructions, questions, fileKeys, fileUrls,
    examDate, totalMarks, sectionHeaders, numberingStyle,
  } = parsed;

  const structured = {
    title: title || null,
    semester: semester || null,
    universityId: universityId || null,
    hierarchyLevelId: hierarchyLevelId || null,
    year: year || null,
    examType: examType || null,
    duration: duration || null,
    instructions: instructions || null,
    questions: questions || [],
    examDate: examDate || null,
    totalMarks: totalMarks ?? null,
    sectionHeaders: sectionHeaders || null,
    numberingStyle: numberingStyle || null,
  };

  const rawFiles = (fileKeys || []).map((key, i) => ({
    key,
    url: (fileUrls || [])[i] || '',
    mimeType: 'application/octet-stream',
  }));

  let draft;
  if (id) {
    draft = await prisma.aiExtractionDraft.update({
      where: { id },
      data: { structured, rawFiles },
    });
  } else {
    draft = await prisma.aiExtractionDraft.create({
      data: {
        uploadedById: req.user.id,
        rawFiles,
        structured,
        status: 'pending',
      },
    });
  }

  try {
    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'paper.save_draft',
      targetType: 'ai_extraction_draft',
      targetId: draft.id,
      meta: { questions: (questions || []).length, semester, hierarchyLevelId },
    });
  } catch (_) { /* best-effort */ }

  res.json({ success: true, draftId: draft.id, draft });
});
