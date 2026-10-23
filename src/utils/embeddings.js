// utils/embeddings.js — Gemini embeddings helper (ported from sfm_client_backend).
// Generates 768-dim vectors via Gemini embedding API. Uses global fetch (Node 18+).
const env = require('../config/env');
const { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } = require('../config/vectorSearch');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_INPUT_CHARS = 8000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function embedUrl() {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set in the environment');
  return `${GEMINI_BASE}/${EMBEDDING_MODEL}:embedContent?key=${env.GEMINI_API_KEY}`;
}

async function postJSON(url, body, { retries = 4, baseDelay = 800 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return await res.json();
      const err = new Error(`Gemini API ${res.status}: ${await res.text().catch(() => '')}`);
      err.status = res.status;
      if (res.status !== 429 && res.status < 500) throw err;
      lastErr = err;
    } catch (e) {
      if (e.status && e.status !== 429 && e.status < 500) throw e;
      lastErr = e;
    }
    if (attempt < retries) await sleep(baseDelay * Math.pow(2, attempt));
  }
  throw lastErr;
}

// taskType: 'RETRIEVAL_DOCUMENT' (stored docs) or 'RETRIEVAL_QUERY' (search queries).
async function getEmbedding(text, taskType = 'RETRIEVAL_DOCUMENT') {
  const data = await postJSON(embedUrl(), {
    content: { parts: [{ text: String(text) }] },
    taskType,
    outputDimensionality: EMBEDDING_DIMENSIONS,
  });
  if (!data.embedding || !Array.isArray(data.embedding.values)) {
    throw new Error('Gemini embedContent returned no embedding values');
  }
  return data.embedding.values;
}

async function getEmbeddings(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  const out = [];
  for (const t of texts) out.push(await getEmbedding(t, taskType));
  return out;
}

module.exports = { getEmbedding, getEmbeddings, EMBEDDING_MODEL };
