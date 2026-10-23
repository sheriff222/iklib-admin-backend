// src/routes/user.js — staff/user management (super_admin).
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { requireAuth, requireRole } = require('../middleware/auth');
const c = require('../controllers/userController');

router.use(requireAuth, requireRole('super_admin'));
router.get('/', asyncHandler(c.list));
router.post('/', asyncHandler(c.create));
router.patch('/:id/role', asyncHandler(c.setRole));
router.delete('/:id', asyncHandler(c.remove));

module.exports = router;
