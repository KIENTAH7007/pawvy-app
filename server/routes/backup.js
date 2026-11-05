const { Router } = require('express');
const fs = require('fs');
const { localDateStr } = require('../utils/dates');

// "Download backup" for the internal app (Settings page). Mounted at /api/backup
// and NOT in the public-prefix list in server/index.js, so the staff PIN gate
// applies — nobody without a valid PIN session can download the database.
//
// Why this exists: Railway's Hobby plan has no volume backups and blocks the
// outgoing mail the old emailed backup (jobs/backup.js) relied on. This lets a
// logged-in person save a full copy of the database file by hand.
//
// The "last downloaded" time lives in the database (tiny app_meta table) so the
// whole team sees the same reminder, whoever downloaded last.
const KEY = 'last_backup_download_at';
const OVERDUE_DAYS = 7;

module.exports = function(db, backupNow, getDbPath) {
  const router = Router();

  db.run(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)`);

  function status() {
    const row = db.queryOne('SELECT value FROM app_meta WHERE key = ?', [KEY]);
    const last = row?.value || null;
    const ms = last ? Date.now() - new Date(last).getTime() : null;
    const days = ms == null || Number.isNaN(ms) ? null : Math.floor(ms / 86400000);
    return {
      last_downloaded_at: last,
      days_since: days,
      overdue_after_days: OVERDUE_DAYS,
      overdue: days == null || days >= OVERDUE_DAYS,
    };
  }

  // GET /api/backup/status
  router.get('/status', (req, res) => res.json(status()));

  // GET /api/backup/download — flushes the latest data to disk first (same call
  // the nightly job used), then sends the database file as an attachment.
  router.get('/download', (req, res) => {
    try {
      backupNow();
      const buf = fs.readFileSync(getDbPath());
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="pawvy-backup-${localDateStr()}.db"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(buf);
    } catch (err) {
      console.error('⚠️  Backup download failed:', err.message);
      res.status(500).json({ error: 'Could not prepare the backup.' });
    }
  });

  // POST /api/backup/confirm — called by the page AFTER the file has actually
  // reached the browser, so a failed download never resets the reminder.
  router.post('/confirm', (req, res) => {
    db.run(`INSERT INTO app_meta (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [KEY, new Date().toISOString()]);
    res.json(status());
  });

  return router;
};
