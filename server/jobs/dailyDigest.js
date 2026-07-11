const { notifyTelegram, notifyEmail } = require('../utils/notify');

// Overdue invoice/SOA digest. Low stock used to be a section here too,
// but a repeating daily push for the same SKU (including ones being
// deliberately deferred, e.g. bulky items) was more annoying than useful
// -- see server/jobs/autoRestock.js, which replaced it with a
// pre-populated Restock Checklist instead of a notification.
function getOverdueDocs(db) {
  // billing_cycle = 'soa' partners: only their SOA documents count.
  // billing_cycle = 'per_invoice' (or unset) partners: only their individual
  // invoices count. Never both for the same partner -- exactly as agreed.
  return db.query(`
    SELECT i.invoice_number, i.type, i.total, i.due_date, pt.company_name,
      CAST((julianday('now') - julianday(i.due_date)) AS INTEGER) AS days_overdue
    FROM invoices i
    JOIN partners pt ON pt.id = i.partner_id
    WHERE i.status = 'Unpaid' AND i.due_date < date('now')
      AND (
        (COALESCE(pt.billing_cycle,'per_invoice') = 'soa' AND i.type = 'SOA')
        OR
        (COALESCE(pt.billing_cycle,'per_invoice') != 'soa' AND i.type = 'Invoice')
      )
    ORDER BY days_overdue DESC
  `);
}

async function runDailyDigest(db) {
  const overdue = getOverdueDocs(db);

  if (overdue.length === 0) {
    console.log('ℹ️  Daily digest: nothing overdue today, skipping send.');
    return;
  }

  const lines = [`*Overdue (${overdue.length}):*`];
  overdue.forEach(d => {
    lines.push(`• ${d.company_name} — ${d.invoice_number} (${d.type}), ${d.days_overdue}d overdue, SGD ${d.total.toFixed(2)}`);
  });

  const emailSubject = `Pawvy Daily Digest — ${overdue.length} overdue`;
  const emailText = lines.join('\n');
  const emailHtml = `<pre style="font-family:inherit;white-space:pre-wrap;">${lines.join('\n').replace(/\*/g,'')}</pre>`;

  const telegramChunks = splitIntoTelegramChunks(lines, '🐾 *Pawvy Daily Digest*');

  await Promise.all([
    sendTelegramChunksInOrder(telegramChunks),
    notifyEmail(emailSubject, emailText, emailHtml),
  ]).catch(err => console.error('⚠️  runDailyDigest send error:', err.message));
}

// Telegram messages are capped at 4096 characters. Splits the line list
// into chunks that stay comfortably under that, without ever cutting a
// line in half, and only prefixes the header on the first chunk.
function splitIntoTelegramChunks(lines, header, maxLen = 3500) {
  const chunks = [];
  let current = header;
  lines.forEach(line => {
    const candidate = current + '\n' + line;
    if (candidate.length > maxLen) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  });
  if (current && current !== header) chunks.push(current);
  else if (chunks.length === 0) chunks.push(current);
  return chunks;
}

async function sendTelegramChunksInOrder(chunks) {
  for (const chunk of chunks) {
    await notifyTelegram(chunk);
  }
}

module.exports = { runDailyDigest, getOverdueDocs };
