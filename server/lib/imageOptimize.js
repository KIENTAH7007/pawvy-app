// Web-friendly copies of banner / Instagram uploads (Oct 2026).
//
// Banners used to be stored exactly as uploaded (often several MB straight
// from a design tool) and every visitor downloaded them in full. This
// resizes to the largest size the page can actually show and re-encodes as
// WebP, which is typically 10-20x smaller with no visible difference. The
// original is never touched here — callers decide whether to keep it.
let sharp = null;
try { sharp = require('sharp'); } catch { /* optional: callers keep the original */ }

const QUALITY = 80;
const SKIP_TYPES = /^image\/(svg\+xml|gif)$/i; // vector / animated: leave alone

// Returns { buffer, contentType, extension, changed }. If optimising isn't
// possible or wouldn't make the file smaller, returns the input unchanged.
async function optimizeForWeb(buffer, contentType, { maxWidth = 1920 } = {}) {
  const unchanged = {
    buffer, contentType,
    extension: (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg').split('+')[0],
    changed: false,
  };
  if (!sharp || SKIP_TYPES.test(contentType || '')) return unchanged;
  try {
    const img = sharp(buffer, { failOn: 'none' });
    const meta = await img.metadata();
    const needsResize = meta.width && meta.width > maxWidth;
    const out = await img.rotate()
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    // Keep the original if re-encoding didn't help (already tiny / already WebP).
    if (!needsResize && out.length >= buffer.length * 0.85) return unchanged;
    if (out.length >= buffer.length) return unchanged;
    return { buffer: out, contentType: 'image/webp', extension: 'webp', changed: true };
  } catch {
    return unchanged;
  }
}

module.exports = { optimizeForWeb };
