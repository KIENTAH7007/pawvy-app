const { Router } = require('express');
const { localDateStr } = require('../utils/dates');
const { voidPendingButtons } = require('../lib/buttons');
const money = require('../lib/money');
const fxLib = require('../lib/fx');

const MARKETPLACE_CHANNELS = ['Shopee', 'Lazada', 'Amazon', 'TikTok Shop'];

// Revenue differs by channel:
// Marketplace: full price (fee is a cost, not a revenue deduction)
// B2B / Event: price minus discount + shipping charged
const REVENUE_EXPR = `CASE WHEN s.channel IN ('Shopee','Lazada','Amazon','TikTok Shop')
  THEN ROUND(s.qty * s.unit_price + COALESCE(s.shipping_charged,0), 2)
  ELSE ROUND(s.qty * s.unit_price - s.platform_fee_amt + COALESCE(s.shipping_charged,0), 2)
END`;

// Profit is consistent: gross margin minus fees/discounts plus shipping net,
// minus Stripe's real processing fee (Patch 122 — website orders only,
// defaults to 0 for every other channel so nothing else changes)
// Row-level profit in the SALE'S OWN currency (SGD for SG; MYR for MY with the
// SGD product cost converted at the rate saved on that sale) — see lib/money.js.
const PROFIT_EXPR = `ROUND(${money.profit('native')}, 2)`;
const COGS_EXPR = `ROUND(${money.cogs('native')}, 2)`;

// Same formula, without the outer ROUND — for use inside SUM() aggregates
// (rounding once after summing exact values is more correct than summing
// several already-rounded values, and matches the pattern already used in
// reports.js's PROFIT_SQL). This is the single source of truth for "what
// counts as profit" in this file — the /summary endpoint below used to
// have three separate hand-copied versions of this formula that quietly
// drifted out of sync with PROFIT_EXPR after the Stripe fee was added in
// Patch 122, so the dashboard's top KPI card silently under-subtracted
// fees while the ledger and monthly trend chart (which used the correct,
// up-to-date formula) did not — always reference this constant instead of
// writing the formula out again.
const PROFIT_RAW_EXPR = money.profit('native');

module.exports = function(db, inventoryRouter) {
  const router = Router();


  // GET sales with rich joined data + computed profit
  router.get('/', (req, res) => {
    const { market, brand_id, partner_id, channel, date_from, date_to, limit, show_voided } = req.query;

    let sql = `
      SELECT
        s.*,
        p.item_series, p.variation, p.barcode,
        b.id AS brand_id, b.name AS brand_name, b.color AS brand_color,
        pt.company_name AS partner_name,
        ${REVENUE_EXPR} AS revenue,
        ${COGS_EXPR} AS cogs,
        ${PROFIT_EXPR} AS profit,
        ROUND((s.unit_price - s.unit_cost * ${money.FX}) / CASE WHEN s.unit_price=0 THEN 1 ELSE s.unit_price END * 100, 1) AS margin_pct
      FROM sales s
      JOIN products  p  ON p.id  = s.product_id
      JOIN brands    b  ON b.id  = p.brand_id
      LEFT JOIN partners pt ON pt.id = s.partner_id
      WHERE 1=1
    `;
    const params = [];

    // Hide voided by default unless explicitly requested
    if (show_voided !== 'true') { sql += ' AND COALESCE(s.voided,0) = 0'; }

    if (market)     { sql += ' AND s.market = ?';          params.push(market); }
    if (brand_id)   { sql += ' AND b.id = ?';              params.push(brand_id); }
    if (partner_id) { sql += ' AND s.partner_id = ?';      params.push(partner_id); }
    if (channel)    { sql += ' AND s.channel = ?';         params.push(channel); }
    if (date_from)  { sql += ' AND s.date >= ?';           params.push(date_from); }
    if (date_to)    { sql += ' AND s.date <= ?';           params.push(date_to); }

    sql += ' ORDER BY s.date DESC, s.created_at DESC';
    if (limit)      { sql += ' LIMIT ?'; params.push(parseInt(limit)); }

    res.json(db.query(sql, params));
  });

  // GET summary totals (for dashboard)
  router.get('/summary', (req, res) => {
    const { market, date_from, date_to } = req.query;
    // One market → that market's currency; All → SGD equivalent (see lib/money.js)
    const mode = money.modeFor(req.query);
    const currency = money.currencyFor(req.query);
    let where = "WHERE COALESCE(s.voided,0) = 0";
    const params = [];
    if (market)    { where += ' AND s.market = ?';  params.push(market); }
    if (date_from) { where += ' AND s.date >= ?';   params.push(date_from); }
    if (date_to)   { where += ' AND s.date <= ?';   params.push(date_to); }

    const revenueExpr = `SUM(${money.revenue(mode)})`;
    const profitExpr = `SUM(${money.profit(mode)})`;

    const totals = db.queryOne(`
      SELECT
        COUNT(*)                                                AS transactions,
        COALESCE(SUM(s.qty), 0)                               AS units_sold,
        ROUND(COALESCE(${revenueExpr}, 0), 2)                 AS revenue,
        ROUND(COALESCE(SUM(${money.cogs(mode)}), 0), 2)       AS cogs,
        ROUND(COALESCE(${profitExpr}, 0), 2)                  AS profit
      FROM sales s
      JOIN products p ON p.id = s.product_id
      ${where}
    `, params);

    // By brand
    const byBrand = db.query(`
      SELECT
        b.id, b.name, b.color,
        ROUND(SUM(${money.profit(mode)}), 2) AS profit,
        SUM(s.qty) AS units
      FROM sales s
      JOIN products p ON p.id = s.product_id
      JOIN brands   b ON b.id = p.brand_id
      ${where}
      GROUP BY b.id ORDER BY profit DESC
    `, params);

    // By month (last 12)
    const byMonth = db.query(`
      SELECT
        strftime('%Y-%m', s.date) AS month,
        ROUND(SUM(${money.profit(mode)}), 2) AS profit,
        ROUND(SUM(${money.revenue(mode)}), 2) AS revenue
      FROM sales s
      JOIN products p ON p.id = s.product_id
      ${where}
      GROUP BY month ORDER BY month DESC LIMIT 12
    `, params);

    res.json({ totals, byBrand, byMonth, currency });
  });

  // GET available channels (for dropdowns)
  router.get('/channels', (req, res) => {
    const channels = db.query('SELECT DISTINCT channel FROM sales ORDER BY channel');
    res.json(channels.map(r => r.channel));
  });

  // GET /best-sellers-report — partner-facing PDF: one page per selected
  // brand, podium for the top 3 plus a ranked list. Shows each SKU's share
  // (%) of its brand's units sold in the period; raw unit counts only when
  // show_units=1. Counts every sales channel; voided sales are excluded.
  // Query: brand_ids (comma list, required), date_from, date_to (YYYY-MM-DD,
  // required), top_n (1-30, default 10), exclude_oos (default 1),
  // show_units (default 0), partner_name (optional "Prepared for" line),
  // brand_tops (optional per-brand Top N, e.g. "2:10,1:5" = brand 2 gets Top 10,
  // brand 1 gets Top 5; brands not listed use top_n).
  router.get('/best-sellers-report', async (req, res) => {
    try {
      const { renderBestSellersPdf } = require('../lib/bestSellersReport');
      const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

      const brandIds = String(req.query.brand_ids || '')
        .split(',').map(v => parseInt(v, 10)).filter(n => Number.isInteger(n) && n > 0);
      if (!brandIds.length) return res.status(400).json({ error: 'Pick at least one brand.' });

      const { date_from, date_to } = req.query;
      if (!isDate(date_from) || !isDate(date_to)) return res.status(400).json({ error: 'A valid start and end date are required.' });
      if (date_from > date_to) return res.status(400).json({ error: 'The start date must be on or before the end date.' });

      const topN = Math.min(30, Math.max(1, parseInt(req.query.top_n, 10) || 10));
      const partnerName = String(req.query.partner_name || '').trim().slice(0, 80);
      const topNByBrand = {};
      String(req.query.brand_tops || '').split(',').forEach(pair => {
        const [id, n] = pair.split(':').map(v => parseInt(v, 10));
        if (Number.isInteger(id) && Number.isInteger(n) && n > 0) topNByBrand[id] = Math.min(30, n);
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="pawvy-best-sellers-${localDateStr()}.pdf"`);
      await renderBestSellersPdf(db, {
        brandIds, dateFrom: date_from, dateTo: date_to, topN, topNByBrand,
        excludeOos: req.query.exclude_oos !== '0',
        showUnits: req.query.show_units === '1',
        partnerName,
      }, res);
    } catch (err) {
      console.error('Best sellers report failed:', err);
      if (!res.headersSent) {
        res.removeHeader('Content-Disposition');
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ error: 'Could not generate the report.' });
      }
      else res.end();
    }
  });

  // POST record a sale
  router.post('/', (req, res) => {
    const {
      date, product_id, partner_id, channel, market,
      qty, unit_cost, unit_price,
      platform_fee_pct, platform_fee_amt,
      shipping_charged, shipping_cost,
      notes
    } = req.body;

    if (!date || !product_id || !channel || !qty || unit_price === undefined) {
      return res.status(400).json({ error: 'date, product_id, channel, qty, unit_price are required' });
    }

    let cost = unit_cost;
    if (cost === undefined || cost === null) {
      const product = db.queryOne('SELECT unit_cost FROM products WHERE id = ?', [product_id]);
      cost = product?.unit_cost || 0;
    }

    const fee_pct = platform_fee_pct || 0;
    const fee_amt = platform_fee_amt !== undefined ? parseFloat(platform_fee_amt) :
                    parseFloat(((qty * unit_price) * (fee_pct / 100)).toFixed(2));

    // MY sales are recorded in MYR with the rate for the sale's own date saved
    // on the row; SG stays SGD (fx_rate NULL). No rate yet → clear 400.
    const mkt = market || 'SG';
    let st;
    try { st = fxLib.stamp(db, mkt, date); } catch (e) { return res.status(e.status || 500).json({ error: e.message }); }

    const result = db.run(`
      INSERT INTO sales
        (date, product_id, partner_id, channel, market, qty, unit_cost, unit_price,
         platform_fee_pct, platform_fee_amt, shipping_charged, shipping_cost, notes, currency, fx_rate)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      date, product_id, partner_id || null, channel, mkt,
      qty, cost, unit_price, fee_pct, fee_amt,
      shipping_charged || 0, shipping_cost || 0,
      notes || null, st.currency, st.fx_rate
    ]);

    const sale = db.queryOne(`
      SELECT s.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color,
        ${REVENUE_EXPR} AS revenue,
        ${COGS_EXPR} AS cogs,
        ${PROFIT_EXPR} AS profit
      FROM sales s JOIN products p ON p.id=s.product_id JOIN brands b ON b.id=p.brand_id
      WHERE s.id = ?
    `, [result.lastID]);

    // Inventory: every sale fulfills from Mega stock — EXCEPT 'Consignment Sale',
    // which is just the invoicing event for stock already deducted at placement time.
    if (inventoryRouter?._recordMovement && channel !== 'Consignment Sale') {
      inventoryRouter._recordMovement({ date, product_id, location: 'Mega', type: 'Sale', qty_change: -parseInt(qty), reference: `sale_${result.lastID}` });
    }

    res.status(201).json(sale);
  });

  // PUT update a sale
  router.put('/:id', (req, res) => {
    const { date, product_id, partner_id, channel, market, qty, unit_cost, unit_price,
            platform_fee_pct, platform_fee_amt, shipping_charged, shipping_cost, notes } = req.body;
    const fee_pct = platform_fee_pct || 0;
    const fee_amt = platform_fee_amt !== undefined ? parseFloat(platform_fee_amt) :
                    parseFloat(((qty * unit_price) * (fee_pct / 100)).toFixed(2));

    // Keep the rate already saved on the row unless the market or date changed
    // (then re-stamp for the new date) — editing a note never re-rates a sale.
    const mkt = market || 'SG';
    const old = db.queryOne('SELECT market, date, fx_rate FROM sales WHERE id=?', [req.params.id]);
    let st;
    try {
      st = (old && old.market === mkt && old.date === date && (mkt !== 'MY' || old.fx_rate))
        ? { currency: mkt === 'MY' ? 'MYR' : 'SGD', fx_rate: mkt === 'MY' ? old.fx_rate : null }
        : fxLib.stamp(db, mkt, date);
    } catch (e) { return res.status(e.status || 500).json({ error: e.message }); }

    db.run(`
      UPDATE sales SET date=?, product_id=?, partner_id=?, channel=?, market=?,
        qty=?, unit_cost=?, unit_price=?, platform_fee_pct=?, platform_fee_amt=?,
        shipping_charged=?, shipping_cost=?,
        notes=?, currency=?, fx_rate=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `, [date, product_id, partner_id||null, channel, mkt, qty, unit_cost, unit_price,
        fee_pct, fee_amt, shipping_charged||0, shipping_cost||0, notes||null, st.currency, st.fx_rate, req.params.id]);

    const sale = db.queryOne(`
      SELECT s.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color,
        ${REVENUE_EXPR} AS revenue,
        ${PROFIT_EXPR} AS profit
      FROM sales s JOIN products p ON p.id=s.product_id JOIN brands b ON b.id=p.brand_id
      WHERE s.id=?
    `, [req.params.id]);
    res.json(sale);
  });

  // PATCH edit shipping/mailing/notes only — deliberately narrower than PUT
  // above. Product, qty, price, and channel affect inventory levels and
  // revenue/profit integrity, so changing those still goes through
  // void + re-record. This covers the common case of correcting shipping
  // charges, courier, mailing details, or notes after the fact without
  // touching anything that could desync stock.
  // customer_email is editable here too (e.g. fixing a typo), but
  // pdpa_consent / pdpa_consent_text are deliberately NOT — consent is an
  // audit trail of what was actually agreed to at checkout and shouldn't be
  // silently rewritable after the fact.
  router.patch('/:id/details', (req, res) => {
    const sale = db.queryOne('SELECT id, stripe_fee_amt FROM sales WHERE id = ?', [req.params.id]);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    const { shipping_charged, shipping_cost, shipping_channel, mailing_name, mailing_address, mailing_phone, mailing_required, notes, customer_email, stripe_fee_amt } = req.body;

    // A manual stripe_fee_amt entry (Aug 2026 — see the Sales Ledger edit
    // modal) is a placeholder, not a confirmed value: mark it
    // unconfirmed so jobs/stripeFeeRefresh.js still double-checks it
    // against Stripe's real fee once settled, and silently corrects it
    // if it turns out KT's guess was off — no need to remember to check
    // back, and no risk of the manual entry and the real value ever
    // getting added together.
    const feeProvided = stripe_fee_amt !== undefined && stripe_fee_amt !== null && stripe_fee_amt !== '';
    const newFee = feeProvided ? parseFloat(stripe_fee_amt) || 0 : sale.stripe_fee_amt;

    db.run(`
      UPDATE sales SET
        shipping_charged=?, shipping_cost=?, shipping_channel=?,
        mailing_name=?, mailing_address=?, mailing_phone=?, mailing_required=?, notes=?, customer_email=?,
        stripe_fee_amt=?, stripe_fee_confirmed=CASE WHEN ? THEN 0 ELSE stripe_fee_confirmed END,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `, [
      parseFloat(shipping_charged) || 0, parseFloat(shipping_cost) || 0, shipping_channel?.trim() || null,
      mailing_name?.trim() || null, mailing_address?.trim() || null, mailing_phone?.trim() || null,
      mailing_required ? 1 : 0,
      notes?.trim() || null, customer_email?.trim() || null,
      newFee, feeProvided ? 1 : 0,
      req.params.id,
    ]);

    const updated = db.queryOne(`
      SELECT s.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color,
        ${REVENUE_EXPR} AS revenue,
        ${PROFIT_EXPR} AS profit
      FROM sales s JOIN products p ON p.id=s.product_id JOIN brands b ON b.id=p.brand_id
      WHERE s.id=?
    `, [req.params.id]);
    res.json(updated);
  });

  // PATCH void a sale (soft delete with audit trail)
  router.patch('/:id/void', (req, res) => {
    const sale = db.queryOne('SELECT * FROM sales WHERE id = ?', [req.params.id]);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    if (sale.voided) return res.json({ ok: true, id: req.params.id, voided: true }); // already voided — no double reversal
    db.run('UPDATE sales SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);

    // Inventory: reverse the original deduction (stock effectively never left)
    if (inventoryRouter?._recordMovement && sale.channel !== 'Consignment Sale') {
      inventoryRouter._recordMovement({
        date: localDateStr(), product_id: sale.product_id, location: 'Mega',
        type: 'Sale Reversal', qty_change: sale.qty, reference: `sale_${sale.id}_void`,
      });
    }

    // BUTTONS: a website order's earn batch is recorded once per ORDER
    // (sourceType:'website_order', sourceId: website_orders.id — see
    // checkout.js), not per sale line, so this cascades from whichever
    // line got voided up to the whole order's batch. voidPendingButtons
    // only touches batches still in 'pending' status (the 7-day hold
    // window) — if the hold already expired and the batch is already
    // spendable/spent, this deliberately does nothing (same reasoning as
    // the hold's own design: clawing back already-usable BUTTONS is the
    // harder problem the hold exists to avoid needing). Safe to call more
    // than once (e.g. voiding several lines of the same order) since it's
    // just an UPDATE ... WHERE status = 'pending'.
    if (sale.website_order_id) {
      voidPendingButtons(db, { sourceType: 'website_order', sourceId: sale.website_order_id });
    }
    // Same idea for a POS checkout (sourceType:'pos_checkout', sourceId:
    // sales.pos_checkout_ref — see routes/pos.js). Two extra nuances here
    // versus the website case: (1) if the customer was unverified at
    // purchase time, no batch exists yet at all (nothing was recorded
    // until/unless they verify — see routes/customers.js), so this is
    // just a no-op, which is correct: there's nothing to void, and the
    // verification-time sweep already excludes voided sales when it sums
    // up what to credit. (2) If they'd already verified and the checkout
    // was already fully credited (hold expired), same as the website case
    // — deliberately does nothing, by design.
    if (sale.pos_checkout_ref) {
      voidPendingButtons(db, { sourceType: 'pos_checkout', sourceId: sale.pos_checkout_ref });
    }

    res.json({ ok: true, id: req.params.id, voided: true });
  });

  // DELETE a sale (hard delete — kept for legacy)
  router.delete('/:id', (req, res) => {
    db.run('DELETE FROM sales WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
