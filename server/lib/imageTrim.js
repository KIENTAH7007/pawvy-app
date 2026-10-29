// Trimmed, square product photos for the website (Oct 2026, per KT).
//
// Product shots come with a lot of empty white border, so on the website the
// product looks small inside its card. Requesting an upload with ?trim=1
// returns the same photo with that uniform border removed and a small even
// margin added back, as a SQUARE so every existing layout (object-fit:
// contain OR cover, 1:1 boxes) behaves exactly as before — only the product
// is bigger.
//
// Speed update (Oct 2026): the work is now (a) done on a downscaled copy,
// (b) kept as raw pixels between steps instead of encoding/decoding PNGs,
// (c) limited to a couple of photos at a time so a page full of cold photos
// can't starve the rest of the app, and (d) available in two sizes (480 for
// cards, 1000 for product pages). routes/uploads.js saves each result in the
// bucket, so this only ever runs once per photo and size.
//
// Safety: sharp's trim only removes rows/columns that match the background
// colour (within a small threshold). Anything that is not background — a
// "Classic / Mini" corner label, a drop shadow, small print — is kept, so no
// information is ever cropped. Any failure falls back to the original file.
let sharp = null;
try { sharp = require('sharp'); } catch { /* sharp optional: callers fall back to the original */ }

const THRESHOLD = 18;      // same tolerance as the Best Sellers PDF
const MARGIN = 0.04;       // 4% of the longest side, each edge
const WORK_SIZE = 1600;    // px, longest side of the working copy
const SIZES = { 480: 82, 1000: 85 };   // allowed output sizes -> JPEG quality
const DEFAULT_SIZE = 1000;
const CACHE_MAX = 300;     // results kept in memory as a fast first layer

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

// At most MAX_PARALLEL photos are processed at once; the rest wait their turn.
const MAX_PARALLEL = 2;
let running = 0;
const waiting = [];
function acquire() {
  if (running < MAX_PARALLEL) { running++; return Promise.resolve(); }
  return new Promise(resolve => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next(); else running--;
}

function normalizeSize(size) {
  const n = parseInt(size, 10);
  return SIZES[n] ? n : DEFAULT_SIZE;
}

const inflight = new Map(); // cacheKey -> Promise (same photo asked for twice at once = one job)

// Returns { buf, type } or null when trimming isn't possible (caller serves the original).
async function trimmedSquare(buffer, cacheKey, sizeArg) {
  if (!sharp) return null;
  const size = normalizeSize(sizeArg);
  const ck = cacheKey ? `${cacheKey}|${size}` : null;
  const hit = ck && cacheGet(ck);
  if (hit) return hit;
  if (ck && inflight.has(ck)) return inflight.get(ck);

  const job = (async () => {
    await acquire();
    try {
      const result = await build(buffer, size);
      if (result && ck) cacheSet(ck, result);
      return result;
    } finally {
      release();
    }
  })();
  if (ck) { inflight.set(ck, job); job.finally(() => inflight.delete(ck)).catch(() => {}); }
  return job;
}

async function build(buffer, size) {
  try {
    // 1) One decode: orient, flatten onto white, downscale, keep as raw pixels.
    const pre = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: WORK_SIZE, height: WORK_SIZE, fit: 'inside', withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = pre.info;
    const rawOf = (data, w, h) => sharp(data, { raw: { width: w, height: h, channels: C } });

    // Background = top-left pixel (what sharp's trim compares against).
    const bg = { r: pre.data[0], g: pre.data[1], b: pre.data[2] };

    // 2) Trim the uniform border (keep it only if something real is left).
    let content = pre.data, cw = W, ch = H;
    try {
      const t = await rawOf(pre.data, W, H).trim({ threshold: THRESHOLD }).raw().toBuffer({ resolveWithObject: true });
      if (t.info.width >= 40 && t.info.height >= 40 && t.info.width <= W && t.info.height <= H) {
        content = t.data; cw = t.info.width; ch = t.info.height;
      }
    } catch { /* uniform image — nothing to trim */ }

    // 3) Pad to a square with an even margin (two steps on purpose: within one
    // sharp pipeline, resize runs BEFORE extend, which would leave the final
    // image larger than the target and non-square).
    const side = Math.round(Math.max(cw, ch) * (1 + 2 * MARGIN));
    const left = Math.floor((side - cw) / 2), top = Math.floor((side - ch) / 2);
    const padded = await rawOf(content, cw, ch)
      .extend({ top, bottom: side - ch - top, left, right: side - cw - left, background: bg })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 4) Final size + JPEG.
    const out = await rawOf(padded.data, padded.info.width, padded.info.height)
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: SIZES[size], mozjpeg: false })
      .toBuffer();
    return { buf: out, type: 'image/jpeg' };
  } catch {
    return null;
  }
}

module.exports = { trimmedSquare, normalizeSize };
