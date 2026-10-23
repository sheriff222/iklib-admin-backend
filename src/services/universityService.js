// src/services/universityService.js — University CRUD + LevelType + HierarchyLevel.
const { z } = require('zod');
const prisma = require('../prisma');

// ─── Zod schemas ────────────────────────────────────────────────────────────

const levelTypeFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['string', 'text', 'number', 'boolean', 'date', 'select']),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(), // for 'select' type
  placeholder: z.string().optional(),
});

const levelTypeSchema = z.object({
  name: z.string().min(1).max(80),
  order: z.number().int().min(0),
  pluralName: z.string().max(80).optional(),
  description: z.string().max(500).optional(),
  fieldSchema: z.object({ fields: z.array(levelTypeFieldSchema) }).default({ fields: [] }),
});

const hierarchyNodeSchema = z.object({
  levelTypeId: z.string().min(1),
  parentId: z.string().nullable().optional(),
  name: z.string().min(1).max(200),
  fieldValues: z.record(z.unknown()).default({}),
});

// ─── University CRUD ─────────────────────────────────────────────────────────

async function listUniversities() {
  return prisma.university.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { hierarchyLevels: true, userLinks: true, examPapers: true } },
    },
  });
}

async function getUniversity(id) {
  return prisma.university.findUnique({
    where: { id },
    include: { levelTypes: { orderBy: { order: 'asc' } } },
  });
}

async function createUniversity(data) {
  const { levelTypes, ...uniData } = data;
  const uni = await prisma.university.create({ data: uniData });
  if (levelTypes?.length) {
    await prisma.levelType.createMany({
      data: levelTypes.map((lt, i) => ({ ...lt, universityId: uni.id, order: lt.order ?? i })),
    });
  }
  return getUniversity(uni.id);
}

async function updateUniversity(id, data) {
  const { levelTypes, ...uniData } = data;
  const uni = await prisma.university.update({ where: { id }, data: uniData });
  return getUniversity(uni.id);
}

async function deleteUniversity(id) {
  // Soft-delete — keep data but mark inactive
  return prisma.university.update({ where: { id }, data: { active: false } });
}

// ─── LevelType CRUD ──────────────────────────────────────────────────────────

async function listLevelTypes(universityId) {
  return prisma.levelType.findMany({
    where: { universityId },
    orderBy: { order: 'asc' },
  });
}

async function createLevelType(universityId, data) {
  return prisma.levelType.create({ data: { ...data, universityId } });
}

async function updateLevelType(id, data) {
  return prisma.levelType.update({ where: { id }, data });
}

async function deleteLevelType(id) {
  // Prevent deletion if any nodes exist of this type
  const count = await prisma.hierarchyLevel.count({ where: { levelTypeId: id } });
  if (count > 0) {
    throw Object.assign(new Error('Cannot delete level type with existing nodes'), { code: 'HAS_NODES' });
  }
  return prisma.levelType.delete({ where: { id } });
}

async function reorderLevelTypes(universityId, orderedIds) {
  const updates = orderedIds.map((id, index) =>
    prisma.levelType.update({ where: { id }, data: { order: index } })
  );
  await prisma.$transaction(updates);
}

// ─── HierarchyLevel CRUD ─────────────────────────────────────────────────────

async function listHierarchyLevels(universityId, { parentId, levelTypeId } = {}) {
  return prisma.hierarchyLevel.findMany({
    where: {
      universityId,
      parentId: parentId ?? null, // null = root nodes
      ...(levelTypeId ? { levelTypeId } : {}),
    },
    orderBy: { name: 'asc' },
    include: {
      levelType: true,
      _count: { select: { children: true, examPapers: true, questions: true } },
    },
  });
}

async function getHierarchyLevel(id) {
  return prisma.hierarchyLevel.findUnique({
    where: { id },
    include: {
      levelType: true,
      parent: { include: { levelType: true } },
      children: { include: { levelType: true }, orderBy: { name: 'asc' } },
    },
  });
}

async function createHierarchyLevel(universityId, data) {
  return prisma.hierarchyLevel.create({ data: { ...data, universityId } });
}

async function updateHierarchyLevel(id, data) {
  return prisma.hierarchyLevel.update({ where: { id }, data });
}

async function deleteHierarchyLevel(id) {
  // Cascade handled by Prisma onDelete=Cascade for children
  // Must not have examPapers or petitions directly pointing to this node
  const epCount = await prisma.examPaper.count({ where: { hierarchyLevelId: id } });
  if (epCount > 0) {
    throw Object.assign(new Error('Cannot delete: exam papers are linked to this level'), { code: 'HAS_PAPERS' });
  }
  return prisma.hierarchyLevel.delete({ where: { id } });
}

// Get the full ancestry path (root → leaf) for a node
async function getAncestryPath(id) {
  const path = [];
  let current = await prisma.hierarchyLevel.findUnique({
    where: { id },
    include: { levelType: true },
  });
  while (current) {
    path.unshift(current);
    current = current.parentId
      ? await prisma.hierarchyLevel.findUnique({
          where: { id: current.parentId },
          include: { levelType: true },
        })
      : null;
  }
  return path;
}

// Get the full tree (all descendants under a node)
async function getSubtree(parentId) {
  const collect = async (pid) => {
    const children = await prisma.hierarchyLevel.findMany({
      where: { parentId: pid },
      include: { levelType: true },
      orderBy: { name: 'asc' },
    });
    const result = [];
    for (const child of children) {
      result.push(child);
    }
    return result;
  };

  const all = [];
  const queue = parentId ? [parentId] : [];

  while (queue.length) {
    const pid = queue.shift();
    const children = await collect(pid);
    for (const child of children) {
      all.push(child);
      queue.push(child.id);
    }
  }

  return all;
}

// ─── Leaf nodes (for exam paper assignment) ──────────────────────────────────
// Returns the deepest level types for a university
async function getLeafLevelTypes(universityId) {
  const all = await prisma.levelType.findMany({
    where: { universityId },
    orderBy: { order: 'asc' },
  });
  if (!all.length) return [];
  const maxOrder = Math.max(...all.map((lt) => lt.order));
  return all.filter((lt) => lt.order === maxOrder);
}

module.exports = {
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
};
