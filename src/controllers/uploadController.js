// src/controllers/uploadController.js — presigned URLs for direct-to-bucket uploads.
const asyncHandler = require('express-async-handler');
const { createPresignedUploads } = require('../utils/storage');

// Body: { filenames: string[], contentTypes?: string[], prefix?: string }
// `contentTypes` is a parallel array to `filenames`; the client's declared
// content type is echoed into the presigned PUT so the signature matches the
// real bytes (avoids 403 on PDF/image uploads).
exports.presign = asyncHandler(async (req, res) => {
  const filenames = Array.isArray(req.body.filenames) ? req.body.filenames : [];
  if (filenames.length === 0) {
    return res.status(400).json({ success: false, message: 'filenames required' });
  }
  const contentTypes = Array.isArray(req.body.contentTypes) ? req.body.contentTypes : [];
  const prefix = req.body.prefix || 'uploads';
  const items = await createPresignedUploads({ prefix, filenames, contentTypes });
  res.json({ success: true, uploads: items });
});
