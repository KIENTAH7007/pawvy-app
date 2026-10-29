const { Router } = require('express');
const { pipeline } = require('stream/promises');
const { getObjectStream, uploadBuffer } = require('../lib/bucket');
const { trimmedSquare, normalizeSize } = require('../lib/imageTrim');

// Railway Buckets are private-only (no public buckets, per Railway's own
// docs as of Aug 2026) — this route is the one place that actually talks
// to the bucket to serve a file publicly. Everything else in the app
// (website, POS, Portal) just uses the resulting stable URL
// (/api/uploads/<key>) and never touches bucket credentials directly.
//
// Cache-Control is long-lived + immutable: every upload gets a fresh,
// unique key (see buildImageKey in lib/bucket.js — includes a timestamp),
// so a given URL's content genuinely never changes. That means browsers
// and any CDN in front of this route can cache forever without ever
// serving a stale image after a re-upload, since a re-upload produces a
// brand-new URL rather than overwriting the old one in place.
module.exports = function() {
  const router = Router();

  // Wildcard route — key can contain slashes (e.g. "products/123-...jpg").
  router.get('/*', async (req, res) => {
    const key = req.params[0];
    if (!key) return res.status(400).json({ error: 'Missing image key.' });

    const wantTrim = req.query.trim === '1';
    const size = normalizeSize(req.query.w);

    // ?trim=1[&w=480|1000] — website product photos: border trimmed, square,
    // product bigger (see lib/imageTrim.js). Each result is saved in the
    // bucket under derived/trim-<size>/<key> the first time it is asked for
    // (the original is never touched), so every later request — from any
    // visitor, and after any deploy or restart — is just a file read.
    // Same immutable-URL caching reasoning as below applies, since the output
    // depends only on the (unique) key and size.
    if (wantTrim) {
      const derivedKey = `derived/trim-${size}/${key.replace(/\.[^./]+$/, '')}.jpg`;
      try {
        const saved = await getObjectStream(derivedKey);
        res.setHeader('Content-Type', saved.ContentType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        if (saved.ContentLength) res.setHeader('Content-Length', saved.ContentLength);
        try { await pipeline(saved.Body, res); } catch { /* client went away */ }
        return;
      } catch { /* not saved yet — build it below */ }

      let original;
      try {
        const o = await getObjectStream(key);
        if (!/^image\/(jpe?g|png|webp)$/i.test(o.ContentType || '')) {
          // Not something we can trim — serve it as-is, below.
          return serveOriginal(res, o);
        }
        const chunks = [];
        for await (const chunk of o.Body) chunks.push(chunk);
        original = { buf: Buffer.concat(chunks), type: o.ContentType };
      } catch (err) {
        return res.status(404).json({ error: 'Image not found.' });
      }
      try {
        const t = await trimmedSquare(original.buf, key, size);
        res.setHeader('Content-Type', t ? t.type : original.type);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.end(t ? t.buf : original.buf);
        // Save for next time (after replying; failure just means we rebuild later).
        if (t) uploadBuffer(derivedKey, t.buf, t.type).catch(() => {});
        return;
      } catch (err) {
        if (!res.headersSent) return res.status(404).json({ error: 'Image not found.' });
        return;
      }
    }

    let obj;
    try {
      obj = await getObjectStream(key);
    } catch (err) {
      // Bucket SDK throws a generic error for missing keys rather than a
      // clean 404 type — treat any failure here as "not found" rather
      // than leaking bucket error details to the client.
      return res.status(404).json({ error: 'Image not found.' });
    }
    return serveOriginal(res, obj);
  });

  return router;
};

async function serveOriginal(res, obj) {
    res.setHeader('Content-Type', obj.ContentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (obj.ContentLength) res.setHeader('Content-Length', obj.ContentLength);

    // Root cause of the socket-pool exhaustion incident (Aug 2026): plain
    // obj.Body.pipe(res) does NOT clean up the source stream if the
    // destination (res) closes early — e.g. a browser picking a different
    // <picture> source once it's decided which one wins, a mobile
    // connection dropping mid-load, or a user navigating away. Each of
    // those left the underlying bucket connection's socket permanently
    // checked out of the pool (default cap: 50), and this route gets hit
    // by every image, on every page view, from every visitor — so it was
    // only a matter of traffic and time before the pool filled up
    // entirely and every further image request (uploads included) queued
    // indefinitely behind it. stream.pipeline() guarantees both streams
    // are destroyed/cleaned up whichever side ends first, so the socket
    // always goes back to the pool. The try/catch below only exists to
    // swallow the now-expected "client disconnected mid-stream" case
    // quietly — the response is already partially sent by that point, so
    // there's nothing meaningful left to respond with anyway.
    try {
      await pipeline(obj.Body, res);
    } catch (err) {
      // Expected on client disconnect — not an error worth logging.
    }
}
