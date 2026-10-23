// src/routes/petition.js — admin petition queue.
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { requireAuth, requireRole } = require('../middleware/auth');
const c = require('../controllers/petitionController');

router.use(requireAuth, requireRole('admin', 'super_admin'));
router.get('/', asyncHandler(c.list));
router.post('/:id/fulfill', asyncHandler(c.fulfill));
router.post('/:id/reject', asyncHandler(c.reject));

module.exports = router;
