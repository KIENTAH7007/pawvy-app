const { uploadBuffer, decodeDataUrl, buildImageKey } = require('../lib/bucket');

// One-time migration, run automatically right after the server starts
// listening (see server/index.js) rather than as a manual script KT has
// to run himself. Idempotent: only ever processes rows where
// image_url IS NULL AND image_data IS NOT NULL, so it's safe to run on
// every deploy — after the first successful run, there's nothing left to
// do and it finishes near-instantly.
//
// Deliberately runs AFTER app.listen(), not before it — blocking startup
// on this would risk Railway's healthcheck timing out on the very first
// deploy if there are a few hundred images to migrate (each one is a
// real network round-trip to the bucket). A failed/restart-looping
// deploy is a much worse outcome than a brief window right after deploy
// where a handful of not-yet-migrated products show without an image —
// and that window closes itself within roughly a minute or two, without
// needing anyone to do anything.
//
// NOTE: this could not be tested against the real Railway Bucket from
// the environment that built it (sandboxed, no network route to
// storage.railway.app) — verified thoroughly against a mocked S3 client
// instead (see the delivery README for what that covered). The very
// first real deploy IS the first real end-to-end test against your
// actual bucket — watch the Railway deploy logs when this ships.

const TABLES = [
  { table: 'products', folder: 'products' },
  { table: 'homepage_banners', folder: 'banners' },
  { table: 'instagram_posts', folder: 'instagram' },
];

async function migrateTable(db, table, folder) {
  const rows = db.query(`SELECT id, image_data FROM ${table} WHERE image_url IS NULL AND image_data IS NOT NULL AND image_data != ''`);
  if (rows.length === 0) return { migrated: 0, failed: 0 };

  console.log(`🪣  Migrating ${rows.length} image(s) from ${table} to the bucket…`);
  let migrated = 0, failed = 0;

  for (const row of rows) {
    try {
      const { buffer, contentType, extension } = decodeDataUrl(row.image_data);
      const { key, url } = buildImageKey(folder, row.id, extension);
      await uploadBuffer(key, buffer, contentType);
      db.run(`UPDATE ${table} SET image_url = ?, image_data = NULL WHERE id = ?`, [url, row.id]);
      migrated++;
    } catch (err) {
      // Don't let one bad row (corrupted base64, oversized image,
      // transient network blip) stop the rest — log it clearly and keep
      // going. image_data is left untouched for anything that failed, so
      // it'll simply be retried on the next deploy.
      console.error(`⚠️  Failed to migrate ${table} row ${row.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`🪣  ${table}: ${migrated} migrated${failed > 0 ? `, ${failed} failed (will retry next deploy)` : ''}`);
  return { migrated, failed };
}

async function runImageMigration(db) {
  let totalMigrated = 0, totalFailed = 0;
  for (const { table, folder } of TABLES) {
    const { migrated, failed } = await migrateTable(db, table, folder);
    totalMigrated += migrated;
    totalFailed += failed;
  }
  if (totalMigrated > 0 || totalFailed > 0) {
    console.log(`🪣  Image migration complete: ${totalMigrated} migrated, ${totalFailed} failed.`);
  }
}

module.exports = { runImageMigration };
