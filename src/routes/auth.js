// src/routes/auth.js — admin/staff auth router.
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/authController');

router.post('/login', authLimiter, asyncHandler(c.login));
router.post('/refresh', asyncHandler(c.refresh));
router.post('/logout', asyncHandler(c.logout));
router.get('/me', requireAuth, asyncHandler(c.me));
router.post('/scope', requireAuth, asyncHandler(c.setScope));

module.exports = router;
