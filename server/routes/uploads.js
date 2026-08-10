const { Router } = require('express');
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

    try {
      const obj = await getObjectStream(key);
      res.setHeader('Content-Type', obj.ContentType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      if (obj.ContentLength) res.setHeader('Content-Length', obj.ContentLength);
      obj.Body.pipe(res);
    } catch (err) {
      // Bucket SDK throws a generic error for missing keys rather than a
      // clean 404 type — treat any failure here as "not found" rather
      // than leaking bucket error details to the client.
      res.status(404).json({ error: 'Image not found.' });
    }
  });

  return router;
};
