// src/routes/examPaper.js — admin paper routes.
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/examPaperController');
const dc = require('../controllers/paperDraftController');
const aac = require('../controllers/aiAnswerController');

router.use(requireAuth);

// Upload + AI extract (sub_admin can upload; reviewer publishes).
router.post('/extract', requireRole('sub_admin', 'admin', 'super_admin'), aiLimiter, asyncHandler(c.extract));

// Save a draft (auto-save during editing). sub_admin+ allowed.
router.post('/draft/save', requireRole('sub_admin', 'admin', 'super_admin'), asyncHandler(dc.saveDraft));

// Publish (reviewers only).
router.post('/publish', requireRole('admin', 'super_admin'), asyncHandler(c.publish));

// Trigger AI answer generation for one or more question IDs (post-publish).
router.post('/generate-answers', requireRole('admin', 'super_admin'), asyncHandler(aac.generateAnswers));

// Read.
router.get('/', asyncHandler(c.list));
router.get('/drafts', requireRole('admin', 'super_admin'), asyncHandler(c.listDrafts));
router.get('/drafts/:id', requireRole('admin', 'super_admin'), asyncHandler(c.getDraft));
router.get('/:id', asyncHandler(c.getOne));

// Edit (reviewer) / delete (super_admin).
router.patch('/:id', requireRole('admin', 'super_admin'), asyncHandler(c.edit));
router.delete('/:id', requireRole('super_admin'), asyncHandler(c.remove));

module.exports = router;
