// src/routes/verification.js — admin verification router.
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { requireAuth, requireRole } = require('../middleware/auth');
const c = require('../controllers/verificationController');

router.use(requireAuth, requireRole('admin', 'super_admin'));
router.get('/', asyncHandler(c.list));
router.get('/pending-count', asyncHandler(c.pendingCount));
router.post('/:id/approve', asyncHandler(c.approve));
router.post('/:id/reject', asyncHandler(c.reject));
router.post('/bulk', asyncHandler(c.bulk));

module.exports = router;
