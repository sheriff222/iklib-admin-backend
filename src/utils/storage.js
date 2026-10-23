// utils/storage.js — presigned PUT URLs for direct-to-bucket uploads (R2 or S3).
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const env = require('../config/env');

const s3 = new S3Client({
  region: env.STORAGE_REGION || 'auto',
  endpoint: env.STORAGE_ENDPOINT || undefined,
  credentials: {
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  },
  // R2 does not support the dual-stack/accelerate fluff; keep it simple.
});

function publicUrlFor(key) {
  if (env.STORAGE_PUBLIC_URL) return `${env.STORAGE_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  return `/${key}`;
}

// Build a unique object key under a prefix (e.g. "papers/2025/cs/abc.pdf").
function objectKey(prefix, filename) {
  const safe = String(filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const id = crypto.randomBytes(8).toString('hex');
  return `${prefix}/${id}-${safe}`;
}

// Returns presigned PUT URLs + their final keys/urls for `count` files of given names.
// `prefix` groups objects (e.g. "papers", "verification"). callers upload bytes
// directly to the bucket; the server only ever stores the keys/urls.
async function createPresignedUploads({ prefix = 'uploads', filenames = [], contentTypes = [] }) {
  const items = await Promise.all(
    filenames.map(async (filename, i) => {
      const key = objectKey(prefix, filename);
      const contentType = contentTypes[i] || 'application/octet-stream';
      const url = await getSignedUrl(
        s3,
        new PutObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key, ContentType: contentType }),
        { expiresIn: 600 }
      );
      return { key, url, filename, contentType };
    })
  );
  return items;
}

// Presigned GET URL for a stored key (e.g. serving a cached PDF). falls back to the
// public URL if the bucket is publicly readable.
async function createPresignedGet(key, expiresIn = 3600) {
  if (!env.STORAGE_ACCESS_KEY_ID) return publicUrlFor(key);
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }), { expiresIn });
}

module.exports = { s3, createPresignedUploads, createPresignedGet, publicUrlFor, objectKey };
