// utils/gemini.js — Gemini generative helper (ported verbatim from
// sfm_client_backend/online_store_api/utils/gemini.js, adapted to ESM-free CommonJS).
// Text + vision generateContent with retry/backoff. Uses global fetch (Node 18+).
const env = require('../config/env');

const GEMINI_GEN_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = env.GEMINI_GENERATE_MODEL;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function genUrl() {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set in the environment');
  return `${GEMINI_GEN_BASE}/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
}

// POST-with-retry. Retries on 429 (rate limit) and 5xx; does NOT retry other 4xx.
async function postGenerate(body, { retries = 3, baseDelay = 800 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(genUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return await res.json();
      const text = await res.text().catch(() => '');
      const err = new Error(`Gemini generateContent ${res.status}: ${text}`);
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

function textFromResponse(data) {
  const cand = data && data.candidates && data.candidates[0];
  if (!cand || !cand.content || !Array.isArray(cand.content.parts)) {
    throw new Error('Gemini response had no content parts');
  }
  return cand.content.parts.map((p) => p.text || '').join('').trim();
}

// Strictly parse JSON out of a model response: tolerates ```json fences and prose.
function extractJSON(text) {
  if (typeof text !== 'string' || !text.trim()) throw new SyntaxError('Empty model response');
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const obj = t.match(/\{[\s\S]*\}/);
  if (obj) t = obj[0];
  return JSON.parse(t);
}

// Core generate. `parts` is an array of Gemini content parts (text / inline_data).
async function generate({ parts, systemInstruction, responseMimeType, temperature = 0.4 }) {
  const body = { contents: [{ role: 'user', parts }] };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  body.generationConfig = { temperature };
  if (responseMimeType) body.generationConfig.responseMimeType = responseMimeType;
  const data = await postGenerate(body);
  return textFromResponse(data);
}

async function generateText(prompt, opts = {}) {
  return generate({ parts: [{ text: prompt }], ...opts });
}

// Multimodal: text prompt + base64-encoded image (no `data:` prefix).
async function generateVision(prompt, base64, mimeType, opts = {}) {
  return generate({
    parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }],
    ...opts,
  });
}

module.exports = { generate, generateText, generateVision, extractJSON, MODEL };
