// src/controllers/universityController.js — CRUD for universities, level types, hierarchy levels.
const asyncHandler = require('express-async-handler');
const { z } = require('zod');
const {
  listUniversities,
  getUniversity,
  createUniversity,
  updateUniversity,
  deleteUniversity,
  listLevelTypes,
  createLevelType,
  updateLevelType,
  deleteLevelType,
  reorderLevelTypes,
  listHierarchyLevels,
  getHierarchyLevel,
  createHierarchyLevel,
  updateHierarchyLevel,
  deleteHierarchyLevel,
  getAncestryPath,
  getSubtree,
  getLeafLevelTypes,
  levelTypeSchema,
  hierarchyNodeSchema,
} = require('../services/universityService');

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createUniversitySchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(2).max(20).toUpperCase(),
  description: z.string().max(1000).optional(),
  website: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  levelTypes: z.array(levelTypeSchema).optional(),
});

const updateUniversitySchema = createUniversitySchema.partial();

const createLevelTypeSchema = levelTypeSchema;
const updateLevelTypeSchema = levelTypeSchema.partial();

const reorderLevelTypesSchema = z.object({
  orderedIds: z.array(z.string()),
});

const createHierarchyLevelSchema = hierarchyNodeSchema;
const updateHierarchyLevelSchema = hierarchyNodeSchema.partial();

// ─── University ──────────────────────────────────────────────────────────────

exports.list = asyncHandler(async (req, res) => {
  const universities = await listUniversities();
  res.json({ success: true, universities });
});

exports.getOne = asyncHandler(async (req, res) => {
  const uni = await getUniversity(req.params.id);
  if (!uni) return res.status(404).json({ success: false, message: 'University not found' });
  res.json({ success: true, university: uni });
});

exports.create = asyncHandler(async (req, res) => {
  const data = createUniversitySchema.parse(req.body);
  const existing = await getUniversityByCode(data.code);
  if (existing) {
    return res.status(409).json({ success: false, message: 'University code already in use' });
  }
  const uni = await createUniversity(data);
  res.status(201).json({ success: true, university: uni });
});

exports.update = asyncHandler(async (req, res) => {
  const data = updateUniversitySchema.parse(req.body);
  const uni = await updateUniversity(req.params.id, data);
  res.json({ success: true, university: uni });
});

exports.remove = asyncHandler(async (req, res) => {
  await deleteUniversity(req.params.id);
  res.json({ success: true, message: 'University deactivated' });
});

// ─── LevelType ───────────────────────────────────────────────────────────────

exports.listLevelTypes = asyncHandler(async (req, res) => {
  const types = await listLevelTypes(req.params.universityId);
  res.json({ success: true, levelTypes: types });
});

exports.createLevelType = asyncHandler(async (req, res) => {
  const data = createLevelTypeSchema.parse(req.body);
  const lt = await createLevelType(req.params.universityId, data);
  res.status(201).json({ success: true, levelType: lt });
});

exports.updateLevelType = asyncHandler(async (req, res) => {
  const data = updateLevelTypeSchema.parse(req.body);
  const lt = await updateLevelType(req.params.id, data);
  res.json({ success: true, levelType: lt });
});

exports.deleteLevelType = asyncHandler(async (req, res) => {
  try {
    await deleteLevelType(req.params.id);
    res.json({ success: true, message: 'Level type deleted' });
  } catch (err) {
    if (err.code === 'HAS_NODES') {
      return res.status(409).json({ success: false, message: err.message, code: err.code });
    }
    throw err;
  }
});

exports.reorderLevelTypes = asyncHandler(async (req, res) => {
  const { orderedIds } = reorderLevelTypesSchema.parse(req.body);
  await reorderLevelTypes(req.params.universityId, orderedIds);
  const types = await listLevelTypes(req.params.universityId);
  res.json({ success: true, levelTypes: types });
});

// ─── HierarchyLevel ──────────────────────────────────────────────────────────

exports.listHierarchyLevels = asyncHandler(async (req, res) => {
  const { parentId, levelTypeId } = req.query;
  const nodes = await listHierarchyLevels(req.params.universityId, {
    parentId: parentId === 'null' ? null : parentId,
    levelTypeId: levelTypeId || undefined,
  });
  res.json({ success: true, hierarchyLevels: nodes });
});

exports.getHierarchyLevel = asyncHandler(async (req, res) => {
  const node = await getHierarchyLevel(req.params.id);
  if (!node) return res.status(404).json({ success: false, message: 'Node not found' });
  res.json({ success: true, hierarchyLevel: node });
});

exports.createHierarchyLevel = asyncHandler(async (req, res) => {
  const data = createHierarchyLevelSchema.parse(req.body);
  const node = await createHierarchyLevel(req.params.universityId, data);
  res.status(201).json({ success: true, hierarchyLevel: node });
});

exports.updateHierarchyLevel = asyncHandler(async (req, res) => {
  const data = updateHierarchyLevelSchema.parse(req.body);
  const node = await updateHierarchyLevel(req.params.id, data);
  res.json({ success: true, hierarchyLevel: node });
});

exports.deleteHierarchyLevel = asyncHandler(async (req, res) => {
  try {
    await deleteHierarchyLevel(req.params.id);
    res.json({ success: true, message: 'Node deleted' });
  } catch (err) {
    if (err.code === 'HAS_PAPERS') {
      return res.status(409).json({ success: false, message: err.message, code: err.code });
    }
    throw err;
  }
});

exports.getAncestryPath = asyncHandler(async (req, res) => {
  const path = await getAncestryPath(req.params.id);
  res.json({ success: true, path });
});

exports.getSubtree = asyncHandler(async (req, res) => {
  const subtree = await getSubtree(req.params.parentId);
  res.json({ success: true, nodes: subtree });
});

exports.getLeafLevelTypes = asyncHandler(async (req, res) => {
  const leaves = await getLeafLevelTypes(req.params.universityId);
  res.json({ success: true, levelTypes: leaves });
});

// Helper
async function getUniversityByCode(code) {
  const { default: prisma } = require('../prisma');
  return prisma.university.findUnique({ where: { code } });
}
