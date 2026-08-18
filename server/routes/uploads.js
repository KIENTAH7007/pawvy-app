const { Router } = require('express');
const { pipeline } = require('stream/promises');
const { getObjectStream } = require('../lib/bucket');

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

    let obj;
    try {
      obj = await getObjectStream(key);
    } catch (err) {
      // Bucket SDK throws a generic error for missing keys rather than a
      // clean 404 type — treat any failure here as "not found" rather
      // than leaking bucket error details to the client.
      return res.status(404).json({ error: 'Image not found.' });
    }

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
  });

  return router;
};
