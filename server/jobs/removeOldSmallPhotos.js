const { listObjects, deleteObject } = require('../lib/bucket');

// One-time tidy-up (Nov 2026, per KT): the small product-photo size changed
// from 480 px to 600 px, so the saved 480 px copies (derived/trim-480/…) are
// no longer used by anything. This deletes ONLY those copies. They are
// purely generated files — the original photos and every other file are
// never touched, and nothing is ever requested from this folder again (a
// request for the old size is now answered with the 600 px version).
//
// Runs after the server is already accepting requests (see server/index.js),
// like the image migration. Safe to run on every start: once the folder is
// empty it is a single quick listing and nothing else.
const PREFIX = 'derived/trim-480/';

async function removeOldSmallPhotos() {
  const objects = await listObjects(PREFIX);
  let deleted = 0, bytes = 0;
  for (const o of objects) {
    if (!o.key.startsWith(PREFIX)) continue; // belt and braces
    try { await deleteObject(o.key); deleted++; bytes += o.size; } catch { /* try again next start */ }
  }
  if (deleted) console.log(`🧹 Removed ${deleted} old 480px photo copies (${(bytes / 1048576).toFixed(1)} MB freed)`);
  return { deleted, bytes };
}

module.exports = { removeOldSmallPhotos };
