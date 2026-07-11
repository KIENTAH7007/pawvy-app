const { notifyTelegram, notifyEmail } = require('../utils/notify');

// Same velocity constants as Restock Checklist's suggestion engine
// (server/routes/restock.js) — kept in sync deliberately so "low stock"
// means the same thing here as it does there. This job only FLAGS which
// SKUs need attention — no suggested quantity, per requirement; the actual
// restock decision and checklist stays entirely manual.
const TRAILING_DAYS = 60;
const LOW_HOME_DAYS = 14;

function getOverdueDocs(db) {
  // billing_cycle = 'soa' partners: only their SOA documents count.
  // billing_cycle = 'per_invoice' (or unset) partners: only their individual
  // invoices count. Never both for the same partner — exactly as agreed.
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

function getLowStockFlags(db) {
  const since = new Date();
  since.setDate(since.getDate() - TRAILING_DAYS);
  const sinceStr = since.toISOString().slice(0, 10);

  const products = db.query(`
    SELECT p.id AS product_id, p.item_series, p.variation, b.name AS brand_name
    FROM products p JOIN brands b ON b.id = p.brand_id
    WHERE p.is_active = 1
    ORDER BY b.name, p.item_series, p.variation
  `);

  const flags = [];
  products.forEach(p => {
    const home = db.queryOne(`
      SELECT COALESCE(SUM(qty_change), 0) AS qty FROM inventory_movements
      WHERE product_id = ? AND location = 'Home'
    `, [p.product_id])?.qty || 0;

    const storhub = db.queryOne(`
      SELECT COALESCE(SUM(qty_change), 0) AS qty FROM inventory_movements
      WHERE product_id = ? AND location = 'Storhub'
    `, [p.product_id])?.qty || 0;

    // If Storhub is also empty, there's nothing to transfer via Restock
    // Checklist — flagging it here wouldn't be actionable the way this
    // digest is meant to be (a same-day Storhub→Home nudge). A SKU that's
    // low at Home AND empty at Storhub is a supplier-reorder problem, a
    // different workflow (Shipments), not this one.
    if (storhub <= 0) return;

    const depleted = db.queryOne(`
      SELECT COALESCE(SUM(-qty_change), 0) AS total
      FROM inventory_movements
      WHERE product_id = ? AND location = 'Home' AND qty_change < 0 AND date >= ?
        AND type IN ('Sale', 'Consignment Placement')
    `, [p.product_id, sinceStr])?.total || 0;

    const dailyVelocity = depleted / TRAILING_DAYS;
    const label = `${p.brand_name} ${p.item_series}${p.variation ? ' · ' + p.variation : ''}`;

    if (dailyVelocity > 0) {
      const daysRemaining = Math.floor(home / dailyVelocity);
      if (daysRemaining < LOW_HOME_DAYS) flags.push(label);
    } else if (home <= 0) {
      // No recent velocity AND already at zero — still worth flagging even
      // though there's no trend to project from.
      flags.push(label);
    }
  });
  return flags;
}

async function runDailyDigest(db) {
  const overdue   = getOverdueDocs(db);
  const lowStock  = getLowStockFlags(db);

  if (overdue.length === 0 && lowStock.length === 0) {
    console.log('ℹ️  Daily digest: nothing to flag today, skipping send.');
    return;
  }

  // No artificial "top 15/20 then …and N more" cutoff — a "…and N more"
  // with no way to actually see the rest was confusing (looked like it
  // should expand in Telegram, but that text is ours, not a Telegram UI
  // feature). Send everything; if it's long enough to risk hitting
  // Telegram's real ~4096-char message limit, split into sequential
  // messages instead of truncating.
  const lines = [];
  if (overdue.length > 0) {
    lines.push(`*Overdue (${overdue.length}):*`);
    overdue.forEach(d => {
      lines.push(`• ${d.company_name} — ${d.invoice_number} (${d.type}), ${d.days_overdue}d overdue, SGD ${d.total.toFixed(2)}`);
    });
  }
  if (lowStock.length > 0) {
    if (lines.length) lines.push('');
    lines.push(`*Low stock at Home (${lowStock.length}):*`);
    lowStock.forEach(l => lines.push(`• ${l}`));
  }

  const emailSubject = `Pawvy Daily Digest — ${overdue.length} overdue, ${lowStock.length} low stock`;
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
  let currentHasHeader = true;
  lines.forEach(line => {
    const candidate = current + '\n' + line;
    if (candidate.length > maxLen) {
      chunks.push(current);
      current = line;
      currentHasHeader = false;
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

module.exports = { runDailyDigest, getOverdueDocs, getLowStockFlags };
