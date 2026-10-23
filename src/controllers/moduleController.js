// src/controllers/moduleController.js — HierarchyLevel management (read-only + reparent).
// ModuleDepartment join table is no longer needed in the hierarchy model.
const asyncHandler = require('express-async-handler');
const prisma = require('../prisma');

exports.updateDepartments = asyncHandler(async (req, res) => {
  // In the hierarchy model, moving a node is just updating parentId.
  // The old "departments linked to module" concept no longer applies.
  // Accept { parentId } to reparent a node within the hierarchy.
  const { parentId } = req.body || {};
  const node = await prisma.hierarchyLevel.findUnique({ where: { id: req.params.id } });
  if (!node) return res.status(404).json({ success: false, message: 'Node not found' });
  const updated = await prisma.hierarchyLevel.update({
    where: { id: req.params.id },
    data: { parentId: parentId || null },
  });
  res.json({ success: true, hierarchyLevel: updated });
});

exports.listDepartments = asyncHandler(async (req, res) => {
  // Return all children of a node (i.e. what's below this level)
  const node = await prisma.hierarchyLevel.findUnique({
    where: { id: req.params.id },
    include: { children: { include: { levelType: true }, orderBy: { name: 'asc' } } },
  });
  if (!node) return res.status(404).json({ success: false, message: 'Node not found' });
  res.json({ success: true, departments: node.children });
});
