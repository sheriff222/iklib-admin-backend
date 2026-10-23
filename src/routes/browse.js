// src/routes/browse.js — hierarchical browse (public; mirrors student backend).
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const c = require('../controllers/browseController');

router.get('/schools', asyncHandler(c.schools));
router.get('/departments', asyncHandler(c.departments));
router.get('/modules', asyncHandler(c.modules));
router.get('/papers', asyncHandler(c.papers));

module.exports = router;
