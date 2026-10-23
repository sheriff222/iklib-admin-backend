// src/services/docExtractor.js — DOCX/DOC → plain text via mammoth (lazy-required).
async function extractDoc(buffer) {
  let mammoth;
  try {
    mammoth = require('mammoth');
  } catch (e) {
    throw new Error('DOC extraction unavailable: mammoth is not installed');
  }
  const result = await mammoth.extractRawText({ buffer });
  return (result.value || '').trim();
}

module.exports = { extractDoc };
