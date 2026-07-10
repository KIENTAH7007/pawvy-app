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

  const lines = [];
  if (overdue.length > 0) {
    lines.push(`*Overdue (${overdue.length}):*`);
    overdue.slice(0, 15).forEach(d => {
      lines.push(`• ${d.company_name} — ${d.invoice_number} (${d.type}), ${d.days_overdue}d overdue, SGD ${d.total.toFixed(2)}`);
    });
    if (overdue.length > 15) lines.push(`…and ${overdue.length - 15} more.`);
  }
  if (lowStock.length > 0) {
    if (lines.length) lines.push('');
    lines.push(`*Low stock at Home (${lowStock.length}):*`);
    lowStock.slice(0, 20).forEach(l => lines.push(`• ${l}`));
    if (lowStock.length > 20) lines.push(`…and ${lowStock.length - 20} more.`);
  }

  const telegramText = `🐾 *Pawvy Daily Digest*\n\n${lines.join('\n')}`;
  const emailSubject = `Pawvy Daily Digest — ${overdue.length} overdue, ${lowStock.length} low stock`;
  const emailText = lines.join('\n');
  const emailHtml = `<pre style="font-family:inherit;white-space:pre-wrap;">${lines.join('\n').replace(/\*/g,'')}</pre>`;

  await Promise.all([
    notifyTelegram(telegramText),
    notifyEmail(emailSubject, emailText, emailHtml),
  ]).catch(err => console.error('⚠️  runDailyDigest send error:', err.message));
}

module.exports = { runDailyDigest, getOverdueDocs, getLowStockFlags };
