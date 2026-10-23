// src/controllers/examPaperController.js — admin: extract draft, publish, list, edit, delete.
const asyncHandler = require('express-async-handler');
const prisma = require('../prisma');
const { extract } = require('../services/extractionService');
const { publishPaper, listPapers, getPaper } = require('../services/paperService');
const { publishSchema } = require('../validation/schemas');

// Create an AI-extraction draft from uploaded files (and/or pasted text).
exports.extract = asyncHandler(async (req, res) => {
  const { files = [], text = null } = req.body || {};
  const structured = await extract({ files, text });
  const draft = await prisma.aiExtractionDraft.create({
    data: {
      uploadedById: req.user.id,
      rawFiles: files,
      structured,
      status: 'pending',
    },
  });
  res.json({ success: true, draftId: draft.id, structured });
});

// Publish a reviewed draft into a real, searchable ExamPaper.
exports.publish = asyncHandler(async (req, res) => {
  const data = publishSchema.parse(req.body);
  if (!data.year || !data.hierarchyLevelId || !data.universityId || !data.title) {
    return res.status(400).json({ success: false, message: 'title, year, universityId and hierarchyLevelId are required' });
  }
  let uploaderId = data.uploaderId || req.user.id; // default uploader = reviewer if unknown
  // If this came from a volunteer draft, credit the original uploader (the student).
  if (data.rawDraftId) {
    const draft = await prisma.aiExtractionDraft.findUnique({ where: { id: data.rawDraftId } });
    if (draft && draft.uploadedById) uploaderId = draft.uploadedById;
  }
  const result = await publishPaper({ data, reviewerId: req.user.id, uploaderId });
  res.status(201).json({ success: true, paper: result.paper, duplicates: result.duplicates });
});

exports.list = asyncHandler(async (req, res) => {
  const { universityId, hierarchyLevelId, year, examType } = req.query;
  const papers = await listPapers({ universityId, hierarchyLevelId, year, examType });
  res.json({ success: true, papers });
});

// Pending AI drafts awaiting review.
exports.listDrafts = asyncHandler(async (req, res) => {
  const drafts = await prisma.aiExtractionDraft.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
    include: { uploadedBy: { select: { name: true, role: true } } },
  });
  res.json({ success: true, drafts });
});

exports.getDraft = asyncHandler(async (req, res) => {
  const draft = await prisma.aiExtractionDraft.findUnique({
    where: { id: req.params.id },
    include: { uploadedBy: { select: { id: true, name: true, role: true } } },
  });
  if (!draft) return res.status(404).json({ success: false, message: 'Draft not found' });
  res.json({ success: true, draft });
});

exports.getOne = asyncHandler(async (req, res) => {
  const paper = await getPaper(req.params.id);
  if (!paper) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, paper });
});

exports.edit = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const updatable = ['title', 'year', 'examType', 'duration', 'instructions'];
  const data = {};
  for (const k of updatable) if (req.body[k] !== undefined) data[k] = req.body[k];
  const paper = await prisma.examPaper.update({ where: { id }, data });
  res.json({ success: true, paper });
});

exports.remove = asyncHandler(async (req, res) => {
  await prisma.examPaper.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: 'Deleted' });
});
