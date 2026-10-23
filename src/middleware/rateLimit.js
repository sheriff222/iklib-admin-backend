// src/middleware/rateLimit.js — per-route rate limiting (express-rate-limit).
const rateLimit = require('express-rate-limit');

// Strict limiter for auth endpoints (login/signup) to blunt brute force.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  standardHeaders: true, // IETF / draft headers that may be undefined in older TS
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later.' },
});

// Gentle limiter for expensive AI/image calls.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many AI requests, please slow down.' },
});

module.exports = { authLimiter, aiLimiter };
