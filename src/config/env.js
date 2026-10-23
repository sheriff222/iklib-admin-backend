// config/env.js — typed env access. Throws on missing required vars at boot.
require('dotenv').config();

const required = ['DATABASE_URL', 'JWT_SECRET', 'GEMINI_API_KEY'];
for (const k of required) {
  if (!process.env[k]) {
    throw new Error(`Missing required environment variable: ${k}`);
  }
}

module.exports = {
  PORT: parseInt(process.env.PORT || '4001', 10),
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRY: process.env.JWT_EXPIRY || '24h',
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || '7d',
  REFRESH_TOKEN_COOKIE_NAME: process.env.REFRESH_TOKEN_COOKIE_NAME || 'iklib_rt_admin',
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_GENERATE_MODEL: process.env.GEMINI_GENERATE_MODEL || 'gemini-2.0-flash',
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
  EMBEDDING_DIMENSIONS: parseInt(process.env.EMBEDDING_DIMENSIONS || '768', 10),
  SEMANTIC_MIN_SCORE: parseFloat(process.env.SEMANTIC_MIN_SCORE || '0.6'),
  STORAGE_BUCKET: process.env.STORAGE_BUCKET,
  STORAGE_REGION: process.env.STORAGE_REGION,
  STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
  STORAGE_ACCESS_KEY_ID: process.env.STORAGE_ACCESS_KEY_ID,
  STORAGE_SECRET_ACCESS_KEY: process.env.STORAGE_SECRET_ACCESS_KEY,
  STORAGE_PUBLIC_URL: process.env.STORAGE_PUBLIC_URL,
  STUDENT_API_ORIGIN: process.env.STUDENT_API_ORIGIN || 'http://localhost:4000',
  ADMIN_FRONTEND_ORIGIN: process.env.ADMIN_FRONTEND_ORIGIN || 'http://localhost:3001',
  WHATSAPP_VERIFICATION_NUMBER: process.env.WHATSAPP_VERIFICATION_NUMBER || '',
};
