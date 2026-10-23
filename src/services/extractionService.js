// src/services/extractionService.js — turn uploaded images / PDFs / text into
// structured exam metadata via Gemini, with retry + safe fallback.
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { generateVision, generateText, extractJSON } = require('../utils/gemini');
const { s3 } = require('../utils/storage');
const { extractionSchema } = require('../validation/schemas');
const { extractDoc } = require('./docExtractor');

// Prompt asks ONLY for the structured JSON shape (no prose, no markdown).
const EXTRACT_PROMPT = `You are an examiner's assistant for a university past-paper archive (UNIMTECH, Sierra Leone).
Analyse this exam material and extract its structure. Return ONLY JSON in this exact shape:
{
  "school": string|null,
  "department": string|null,
  "moduleName": string|null,
  "moduleCode": string|null,
  "year": number|null,
  "examType": "Final"|"Mid-Sem"|"Referral"|"Resit"|"Quiz"|null,
  "duration": string|null,
  "instructions": string|null,
  "questions": [ { "text": string, "marks": number|null } ]
}
Rules: do NOT invent a module that is not shown; "questions" are the numbered exam questions; include "marks" only if visible on the page. If the page is blurry, do your best and leave uncertain fields null.`;

async function fileBytes(key) {
  const env = require('../config/env');
  const data = await s3.send(new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
  const chunks = [];
  for await (const c of data.Body) chunks.push(c);
  return Buffer.concat(chunks);
}

async function extractImage(base64, mimeType) {
  const raw = await generateVision(EXTRACT_PROMPT, base64, mimeType, { responseMimeType: 'application/json' });
  return extractJSON(raw);
}

// PDF → rasterize each page to PNG → extract per page → merge questions.
async function extractPdf(buffer) {
  // Lazily required so the server still boots where pdf-to-img/canvas isn't
  // installed (minimal/CI environments). PDF rasterization is the only feature
  // that needs it; every other path works without it.
  let pdf;
  try {
    ({ pdf } = require('pdf-to-img'));
  } catch (e) {
    throw new Error('PDF extraction unavailable: pdf-to-img/canvas is not installed in this environment.');
  }
  const doc = await pdf(buffer, { scale: 2 });
  let merged = { questions: [] };
  for await (const page of doc) {
    // page is a PNG Buffer
    const b64 = page.toString('base64');
    try {
      const part = await extractImage(b64, 'image/png');
      merged = {
        school: merged.school || part.school,
        department: merged.department || part.department,
        moduleName: merged.moduleName || part.moduleName,
        moduleCode: merged.moduleCode || part.moduleCode,
        year: merged.year || part.year,
        examType: merged.examType || part.examType,
        duration: merged.duration || part.duration,
        instructions: [merged.instructions, part.instructions].filter(Boolean).join(' ').trim() || null,
        questions: merged.questions.concat(part.questions || []),
      };
    } catch (e) {
      console.warn('[extract] pdf page failed:', e.message);
    }
  }
  return merged;
}

async function extractText(text) {
  const raw = await generateText(
    EXTRACT_PROMPT + `\n\nExam text:\n"""${text}"""`,
    { responseMimeType: 'application/json' }
  );
  return extractJSON(raw);
}

// Main entry. `files` = [{key,url,mimeType}]; `text` optional pasted content.
// Never throws to the caller on AI failure — returns a validated (possibly empty) draft.
async function extract({ files = [], text = null }) {
  let combined = { questions: [] };
  for (const f of files) {
    try {
      let parsed;
      if (f.mimeType === 'application/pdf') {
        parsed = await extractPdf(await fileBytes(f.key));
      } else if (f.mimeType && f.mimeType.startsWith('image/')) {
        const buf = await fileBytes(f.key);
        parsed = await extractImage(buf.toString('base64'), f.mimeType);
      } else if (
        f.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        f.mimeType === 'application/msword'
      ) {
        const docText = await extractDoc(await fileBytes(f.key));
        if (docText) {
          parsed = await extractText(docText);
        } else {
          continue;
        }
      } else {
        continue;
      }
      combined = {
        school: combined.school || parsed.school,
        department: combined.department || parsed.department,
        moduleName: combined.moduleName || parsed.moduleName,
        moduleCode: combined.moduleCode || parsed.moduleCode,
        year: combined.year || parsed.year,
        examType: combined.examType || parsed.examType,
        duration: combined.duration || parsed.duration,
        instructions: [combined.instructions, parsed.instructions].filter(Boolean).join(' ').trim() || null,
        questions: combined.questions.concat(parsed.questions || []),
      };
    } catch (e) {
      console.warn('[extract] file failed, skipping:', f.key, e.message);
    }
  }
  if (text && !combined.moduleName && combined.questions.length === 0) {
    try {
      const parsed = await extractText(text);
      combined = {
        school: combined.school || parsed.school,
        department: combined.department || parsed.department,
        moduleName: combined.moduleName || parsed.moduleName,
        moduleCode: combined.moduleCode || parsed.moduleCode,
        year: combined.year || parsed.year,
        examType: combined.examType || parsed.examType,
        duration: combined.duration || parsed.duration,
        instructions: combined.instructions || parsed.instructions,
        questions: combined.questions.concat(parsed.questions || []),
      };
    } catch (e) {
      console.warn('[extract] text failed:', e.message);
    }
  }
  // Retry-once is handled inside generateVision/generateText (postGenerate). Here we
  // validate; if invalid, fall back to an empty-but-valid draft so the form still loads.
  try {
    return extractionSchema.parse(combined);
  } catch (e) {
    return extractionSchema.parse({ questions: [] });
  }
}

module.exports = { extract };
