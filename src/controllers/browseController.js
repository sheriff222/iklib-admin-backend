// src/controllers/browseController.js — hierarchical browse for the admin app.
// Works with the new HierarchyLevel model. Reads levelTypeId from query params
// or infers them from the university context.
const asyncHandler = require('express-async-handler');
const prisma = require('../prisma');

exports.schools = asyncHandler(async (req, res) => {
  // For backwards compat: return the top-level hierarchy nodes (levelType with lowest order)
  const universityId = req.query.universityId;
  if (!universityId) return res.status(400).json({ success: false, message: 'universityId required' });

  const topLevelTypes = await prisma.levelType.findFirst({
    where: { universityId },
    orderBy: { order: 'asc' },
  });
  if (!topLevelTypes) return res.json({ success: true, schools: [] });

  const nodes = await prisma.hierarchyLevel.findMany({
    where: { universityId, levelTypeId: topLevelTypes.id },
    include: {
      levelType: true,
      _count: { select: { children: true, examPapers: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, schools: nodes });
});

exports.departments = asyncHandler(async (req, res) => {
  const universityId = req.query.universityId;
  const parentId = req.query.parentId;
  if (!universityId) return res.status(400).json({ success: false, message: 'universityId required' });

  const nodes = await prisma.hierarchyLevel.findMany({
    where: { universityId, parentId: parentId || null },
    include: {
      levelType: true,
      _count: { select: { children: true, examPapers: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, departments: nodes });
});

exports.modules = asyncHandler(async (req, res) => {
  const universityId = req.query.universityId;
  const parentId = req.query.parentId;
  if (!universityId) return res.status(400).json({ success: false, message: 'universityId required' });

  const nodes = await prisma.hierarchyLevel.findMany({
    where: { universityId, parentId: parentId || null },
    include: {
      levelType: true,
      _count: { select: { examPapers: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, modules: nodes });
});

exports.papers = asyncHandler(async (req, res) => {
  const { universityId, hierarchyLevelId, year, examType, status } = req.query;
  const where = { status: status || 'published' };
  if (universityId) where.universityId = universityId;
  if (hierarchyLevelId) where.hierarchyLevelId = hierarchyLevelId;
  if (year) where.year = parseInt(year, 10);
  if (examType) where.examType = examType;

  const papers = await prisma.examPaper.findMany({
    where,
    include: {
      hierarchyLevel: { select: { id: true, name: true, levelType: { select: { name: true } } } },
      _count: { select: { questions: true, bookmarks: true } },
    },
    orderBy: { publishedAt: 'desc' },
    take: 100,
  });
  res.json({ success: true, papers });
});
