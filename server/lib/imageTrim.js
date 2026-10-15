// Trimmed, square product photos for the website (Oct 2026, per KT).
//
// Product shots come with a lot of empty white border, so on the website the
// product looks small inside its card. Requesting an upload with ?trim=1
// returns the same photo with that uniform border removed and a small even
// margin added back, as a SQUARE so every existing layout (object-fit:
// contain OR cover, 1:1 boxes) behaves exactly as before — only the product
// is bigger.
//
// Safety: sharp's trim only removes rows/columns that match the background
// colour (within a small threshold). Anything that is not background — a
// "Classic / Mini" corner label, a drop shadow, small print — is kept, so no
// information is ever cropped. Any failure falls back to the original file.
let sharp = null;
try { sharp = require('sharp'); } catch { /* sharp optional: callers fall back to the original */ }

const THRESHOLD = 18;      // same tolerance as the Best Sellers PDF
const MARGIN = 0.04;       // 4% of the longest side, each edge
const OUT_SIZE = 1000;     // px, longest side
const CACHE_MAX = 400;     // trimmed results kept in memory (~100 KB each)

const cache = new Map();   // key -> { buf, type } (insertion-ordered = simple LRU)

function cacheGet(k) {
  const v = cache.get(k);
  if (v) { cache.delete(k); cache.set(k, v); }
  return v;
}
function cacheSet(k, v) {
  cache.set(k, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

// Returns { buf, type } or null when trimming isn't possible (caller serves the original).
async function trimmedSquare(buffer, cacheKey) {
  if (!sharp) return null;
  const hit = cacheKey && cacheGet(cacheKey);
  if (hit) return hit;
  try {
    const base = sharp(buffer).rotate().flatten({ background: '#ffffff' });
    const meta = await base.clone().metadata();

    // Background = top-left pixel (what sharp's trim compares against).
    const px = await base.clone().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    const bg = { r: px[0], g: px[1], b: px[2] };

    let content = null, cw = meta.width, ch = meta.height;
    try {
      const { data, info } = await base.clone().trim({ threshold: THRESHOLD }).toBuffer({ resolveWithObject: true });
      // keep the trim only if something real is left
      if (info.width >= 40 && info.height >= 40 && info.width <= meta.width && info.height <= meta.height) {
        content = data; cw = info.width; ch = info.height;
      }
    } catch { /* uniform image — nothing to trim */ }
    if (!content) content = await base.clone().png().toBuffer();

    const side = Math.round(Math.max(cw, ch) * (1 + 2 * MARGIN));
    const left = Math.floor((side - cw) / 2), top = Math.floor((side - ch) / 2);
    // Two steps on purpose: within one sharp pipeline, resize runs BEFORE
    // extend, which would leave the final image larger than OUT_SIZE and
    // non-square.
    const padded = await sharp(content)
      .extend({ top, bottom: side - ch - top, left, right: side - cw - left, background: bg })
      .png()
      .toBuffer();
    const out = await sharp(padded)
      .resize({ width: OUT_SIZE, height: OUT_SIZE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    const result = { buf: out, type: 'image/jpeg' };
    if (cacheKey) cacheSet(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

module.exports = { trimmedSquare };
