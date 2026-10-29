const { getObjectStream, uploadBuffer, buildImageKey } = require('./bucket');
const { optimizeForWeb } = require('./imageOptimize');

// One-time (safe to re-run) optimiser for images uploaded before optimising
// existed. For each homepage banner image (desktop / tablet / mobile) and
// Instagram highlight it reads the stored file, makes a resized WebP copy,
// and — only if that copy is clearly smaller — saves it under a new key and
// points the database at it. The ORIGINAL object is never deleted or changed,
// so nothing can be lost; and an already-light image is skipped, which is
// what makes re-running harmless.
const TARGETS = [
  { table: 'homepage_banners', column: 'image_url',        folder: 'banners',        maxWidth: 1920, label: 'Banner (desktop)' },
  { table: 'homepage_banners', column: 'image_url_tablet', folder: 'banners-tablet', maxWidth: 1200, label: 'Banner (tablet)' },
  { table: 'homepage_banners', column: 'image_url_mobile', folder: 'banners-mobile', maxWidth: 800,  label: 'Banner (mobile)' },
  { table: 'instagram_posts',  column: 'image_url',        folder: 'instagram',      maxWidth: 800,  label: 'Instagram' },
];

async function readObject(key) {
  const o = await getObjectStream(key);
  const chunks = [];
  for await (const c of o.Body) chunks.push(c);
  return { buffer: Buffer.concat(chunks), contentType: o.ContentType || 'image/jpeg' };
}

async function optimizeExistingImages(db) {
  const items = [];
  for (const t of TARGETS) {
    const rows = db.query(`SELECT id, ${t.column} AS url FROM ${t.table} WHERE ${t.column} IS NOT NULL AND ${t.column} != ''`);
    for (const row of rows) {
      const item = { label: `${t.label} #${row.id}`, status: 'skipped', beforeKB: 0, afterKB: 0 };
      items.push(item);
      if (!row.url.startsWith('/api/uploads/')) { item.status = 'not a stored file'; continue; }
      try {
        const key = row.url.replace(/^\/api\/uploads\//, '');
        const orig = await readObject(key);
        item.beforeKB = Math.round(orig.buffer.length / 1024);
        item.afterKB = item.beforeKB;
        const opt = await optimizeForWeb(orig.buffer, orig.contentType, { maxWidth: t.maxWidth });
        // Only switch if it is meaningfully lighter (at least 15% smaller).
        if (!opt.changed || opt.buffer.length > orig.buffer.length * 0.85) { item.status = 'already light'; continue; }
        const { key: newKey, url: newUrl } = buildImageKey(t.folder, row.id, opt.extension);
        await uploadBuffer(newKey, opt.buffer, opt.contentType);
        db.run(`UPDATE ${t.table} SET ${t.column} = ? WHERE id = ?`, [newUrl, row.id]);
        item.afterKB = Math.round(opt.buffer.length / 1024);
        item.status = 'optimised';
      } catch (err) {
        item.status = 'failed: ' + err.message;
      }
    }
  }
  const optimised = items.filter(i => i.status === 'optimised');
  return {
    ok: true,
    checked: items.length,
    optimised: optimised.length,
    savedKB: optimised.reduce((n, i) => n + (i.beforeKB - i.afterKB), 0),
    items,
  };
}

module.exports = { optimizeExistingImages };
