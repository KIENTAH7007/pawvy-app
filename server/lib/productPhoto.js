// Web-friendly copies of product photos (Nov 2026).
//
// New product photo uploads used to be stored exactly as sent (up to 2 MB).
// This shrinks them to what the website can actually show — longest side at
// most 1600 px, re-encoded as a high-quality JPEG — which is typically
// 150–400 KB instead of 1–2 MB. Transparent PNGs get a white background
// (product shots already sit on white). The website's own 600 / 1000 px
// trimmed copies (lib/imageTrim.js) are made FROM this stored original, so
// they are unaffected. If sharp is unavailable, or shrinking would not help,
// the upload is stored exactly as before.
let sharp = null;
try { sharp = require('sharp'); } catch { /* optional */ }

const MAX_SIDE = 1600;
const QUALITY = 85;

// Returns { buffer, contentType, extension, changed }
async function compressPhoto(buffer, contentType) {
  const unchanged = {
    buffer, contentType,
    extension: (String(contentType).split('/')[1] || 'jpg').replace('jpeg', 'jpg').split('+')[0],
    changed: false,
  };
  if (!sharp || !/^image\/(jpe?g|png|webp)$/i.test(contentType || '')) return unchanged;
  try {
    const out = await sharp(buffer, { failOn: 'none' })
      .rotate()                                   // honour phone-camera orientation
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
    // Never make things worse: keep the original if it is already smaller.
    if (out.length >= buffer.length && /jpe?g/i.test(contentType)) return unchanged;
    return { buffer: out, contentType: 'image/jpeg', extension: 'jpg', changed: true };
  } catch {
    return unchanged;
  }
}

module.exports = { compressPhoto, MAX_SIDE };
