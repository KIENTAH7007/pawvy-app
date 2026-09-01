const { notifyBackupEmail } = require('../utils/notify');
const { localDateStr } = require('../utils/dates');

// Daily backup — emails the raw SQLite file as an attachment to a
// dedicated backup inbox (BACKUP_EMAIL_TO), separate from the main
// business inbox. No rotation/deletion logic: at this database's size
// (well under 1MB per day of realistic activity), keeping every day's
// backup indefinitely costs nothing and avoids the failure mode of a
// rotating window silently losing the last good copy if a problem goes
// unnoticed for a few days.
async function runDailyBackup(backupNow, getDbPath) {
  // Force an immediate flush to disk first — sql.js normally persists on
  // a 5-second debounce, so without this the backup could be up to 5
  // seconds stale relative to the very latest write.
  backupNow();

  const dbPath = getDbPath();
  const today = localDateStr();

  const sent = await notifyBackupEmail(
    `Pawvy DB Backup — ${today}`,
    `Automated daily backup of the Pawvy database, generated ${new Date().toISOString()}.\n\nThis is a raw SQLite file — no action needed unless you're restoring from it.`,
    dbPath,
    `pawvy-backup-${today}.db`
  );

  if (sent) console.log(`✅ Daily backup emailed (${today})`);
}

module.exports = { runDailyBackup };
