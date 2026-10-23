// src/routes/universities.js — University, LevelType, and HierarchyLevel CRUD.
// super_admin creates/manages universities.
// admin / sub_admin operate within their assigned university (enforced by requireUniversityScope).
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { requireAuth, requireRole, requireUniversityScope } = require('../middleware/auth');
const c = require('../controllers/universityController');

// All routes require auth
router.use(requireAuth);

// ─── University ───────────────────────────────────────────────────────────────

// List all (super_admin sees all; admin/sub_admin see only their own)
router.get('/', asyncHandler(c.list));

// super_admin only: create university
router.post('/', requireRole('super_admin'), asyncHandler(c.create));

// Get one
router.get('/:id', requireUniversityScope(), asyncHandler(c.getOne));

// Update
router.patch('/:id', requireUniversityScope(), asyncHandler(c.update));

// Deactivate (soft-delete) — super_admin only
router.delete('/:id', requireRole('super_admin'), asyncHandler(c.remove));

// ─── LevelType ───────────────────────────────────────────────────────────────

router.get(
  '/:universityId/level-types',
  requireUniversityScope('universityId'),
  asyncHandler(c.listLevelTypes)
);

router.post(
  '/:universityId/level-types',
  requireUniversityScope('universityId'),
  requireRole('admin', 'super_admin'),
  asyncHandler(c.createLevelType)
);

router.patch(
  '/:universityId/level-types/:id',
  requireUniversityScope('universityId'),
  requireRole('admin', 'super_admin'),
  asyncHandler(c.updateLevelType)
);

router.delete(
  '/:universityId/level-types/:id',
  requireUniversityScope('universityId'),
  requireRole('admin', 'super_admin'),
  asyncHandler(c.deleteLevelType)
);

router.post(
  '/:universityId/level-types/reorder',
  requireUniversityScope('universityId'),
  requireRole('admin', 'super_admin'),
  asyncHandler(c.reorderLevelTypes)
);

// ─── HierarchyLevel ────────────────────────────────────────────────────────────

router.get(
  '/:universityId/hierarchy',
  requireUniversityScope('universityId'),
  asyncHandler(c.listHierarchyLevels)
);

router.post(
  '/:universityId/hierarchy',
  requireUniversityScope('universityId'),
  requireRole('sub_admin', 'admin', 'super_admin'),
  asyncHandler(c.createHierarchyLevel)
);

// Leaf level types (for paper assignment dropdown)
router.get(
  '/:universityId/hierarchy/leaf-types',
  requireUniversityScope('universityId'),
  asyncHandler(c.getLeafLevelTypes)
);

router.get(
  '/:universityId/hierarchy/:id',
  requireUniversityScope('universityId'),
  asyncHandler(c.getHierarchyLevel)
);

router.patch(
  '/:universityId/hierarchy/:id',
  requireUniversityScope('universityId'),
  requireRole('sub_admin', 'admin', 'super_admin'),
  asyncHandler(c.updateHierarchyLevel)
);

router.delete(
  '/:universityId/hierarchy/:id',
  requireUniversityScope('universityId'),
  requireRole('admin', 'super_admin'),
  asyncHandler(c.deleteHierarchyLevel)
);

// Ancestry path for a node
router.get(
  '/hierarchy/:id/ancestry',
  requireAuth,
  asyncHandler(c.getAncestryPath)
);

module.exports = router;
