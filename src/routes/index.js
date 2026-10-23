// src/routes/index.js — admin API router (mounted at /api).
const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => res.json({ ok: true, area: 'admin' }));

router.use('/auth', require('./auth'));
router.use('/verifications', require('./verification'));
router.use('/upload', require('./upload'));
router.use('/papers', require('./examPaper'));
router.use('/users', require('./user'));
router.use('/audit', require('./audit'));
router.use('/browse', require('./browse'));
router.use('/petitions', require('./petition'));
router.use('/modules', require('./modules'));
router.use('/universities', require('./universities'));

module.exports = router;
