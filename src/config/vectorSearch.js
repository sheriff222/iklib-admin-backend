// config/vectorSearch.js — shared Gemini embedding config (ported from sfm_client_backend).
// Keep EMBEDDING_DIMENSIONS in sync with EMBEDDING_MODEL's output size.
const env = require('./env');

module.exports = {
  EMBEDDING_MODEL: env.EMBEDDING_MODEL, // 'gemini-embedding-001'
  EMBEDDING_DIMENSIONS: env.EMBEDDING_DIMENSIONS, // 768
  EMBEDDING_SIMILARITY: 'cosine',
  EMBEDDING_MIN_SCORE: env.SEMANTIC_MIN_SCORE, // 0 disables the floor
};
