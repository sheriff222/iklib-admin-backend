// src/index.js — admin backend entrypoint (CommonJS, Express).
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const env = require('./config/env');
const apiRoutes = require('./routes');

const app = express();

app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));

// CORS configuration: permissive in development, strict in production
const isProduction = process.env.NODE_ENV === 'production';
const corsOptions = {
  origin: isProduction
    ? env.ALLOWED_ORIGINS
    : true, // allow all origins in development (reflects request origin)
  credentials: true,
};
app.use(cors(corsOptions));

app.get('/health', (req, res) => res.json({ ok: true, service: 'iklib-backend-admin' }));

app.use('/api', apiRoutes);

// 404 + error handler
app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));

/**
 * Known-sensitive substrings that should never reach the client — they indicate
 * internal infrastructure details (Prisma, DB connection strings, file paths,
 * stack frames, etc.).  Any of these appearing in an error message means the
 * raw message must be suppressed and replaced with a safe fallback.
 */
const SENSITIVE_PATTERNS = [
  /prisma/i,
  /database/i,
  /postgres|postgresql/i,
  /supabase/i,
  /aws-.*\.pooler/i,
  /connection.*refused|ECONNREFUSED/i,
  /env\s*=|environment/i,
  /at\s+.*\.(js|ts):\d+:\d+/im,   // stack frames
  /\/home\/|\/usr\/|\/node_modules\//i,  // file paths
  /Cannot read properties/i,
  /undefined is not an object/i,
  /unexpected token/i,
  /SyntaxError/i,
  /Validation error/i,
  /unique constraint|duplicate key/i,
  /foreign key/i,
  /invalid.*invocation/i,
  /Can't connect to/i,
  /P1001|P1017|P2025/i, // common Prisma error codes
];

/**
 * Returns a clean, user-safe message for the client.  The full error
 * (including stack, original message, and request context) is always printed
 * to the server console so nothing is lost for debugging.
 */
function sanitizeErrorMessage(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') return null;
  const isSensitive = SENSITIVE_PATTERNS.some((p) => p.test(rawMessage));
  if (isSensitive) return null; // caller will substitute a safe fallback
  // Truncate to avoid accidentally long messages
  return rawMessage.length > 200 ? rawMessage.slice(0, 200) + '…' : rawMessage;
}

/** Maps a raw HTTP status to a safe, translatable client message. */
const FALLBACK_MESSAGES = {
  400: 'The request was invalid. Please check your input and try again.',
  401: 'Authentication required. Please log in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  409: 'A conflict occurred. Please refresh and try again.',
  422: 'Validation failed. Please check your input.',
  429: 'Too many requests. Please wait a moment before trying again.',
  500: 'Something went wrong on our end. Please try again in a few minutes.',
  502: 'The server is temporarily unavailable. Please try again later.',
  503: 'The service is temporarily unavailable. Please try again later.',
};
const DEFAULT_FALLBACK = 'An unexpected error occurred. Please try again.';

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;

  // Always log full detail server-side — this is the debug terminal.
  console.error(
    `[${new Date().toISOString()}] [${req.method} ${req.originalUrl}]`,
    '\n  status:', status,
    '\n  message:', err.message,
    '\n  stack:', err.stack,
    '\n  body:', req.body,
  );

  // Determine a safe message for the client.
  const safeMsg =
    sanitizeErrorMessage(err.message) ||
    FALLBACK_MESSAGES[status] ||
    DEFAULT_FALLBACK;

  res.status(status).json({ success: false, message: safeMsg });
});

app.listen(env.PORT, () => {
  console.log(`iklib-backend-admin listening on :${env.PORT}`);
});

module.exports = app;
