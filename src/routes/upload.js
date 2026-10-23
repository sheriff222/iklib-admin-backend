// src/routes/upload.js — presigned upload URLs (sub_admin / admin / super_admin).
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { requireAuth, requireRole } = require('../middleware/auth');
const c = require('../controllers/uploadController');

router.use(requireAuth, requireRole('sub_admin', 'admin', 'super_admin'));
router.post('/presign', asyncHandler(c.presign));

module.exports = router;
