// src/routes/modules.js — module admin endpoints (department linking).
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { requireAuth, requireRole } = require('../middleware/auth');
const c = require('../controllers/moduleController');

router.use(requireAuth);
router.patch('/:id/departments', requireRole('admin', 'super_admin'), asyncHandler(c.updateDepartments));
router.get('/:id/departments', asyncHandler(c.listDepartments));

module.exports = router;
