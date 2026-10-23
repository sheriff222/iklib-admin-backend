// src/routes/audit.js — audit log (admin / super_admin).
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { requireAuth, requireRole } = require('../middleware/auth');
const c = require('../controllers/auditController');

router.use(requireAuth, requireRole('admin', 'super_admin'));
router.get('/', asyncHandler(c.list));

module.exports = router;
