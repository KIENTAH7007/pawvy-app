const { Router } = require('express');
const { upsertCustomerFromSignup } = require('../lib/customers');
const { recordPosCheckoutButtons, getActiveMultiplierDetail } = require('../lib/buttons');

// Pawvy POS System — a separate public portal (like the Order Portal) used
// at physical events, so staff never need to open the internal app in front
// of customers. Key differences from the Order Portal, by design:
//   - RRP only, never wholesale price (customer-facing, no internal pricing leak)
//   - Barcode-scan friendly (exact barcode match on Enter)
//   - No approval queue — "Thank you!" writes straight to Sales Ledger
//   - No Telegram/email notification (this isn't a queue item needing review)
//   - Optional mailing details captured when an item needs to be posted out
module.exports = function(db, inventoryRouter) {
  const router = Router();

  function stockStatus(totalQty) {
    if (totalQty <= 0) return 'out_of_stock';
    if (totalQty <= 5) return 'low_stock';
    return 'available';
  }

  // GET /api/pos/active-campaign — powers the "🎉 X× BUTTONS today" badge
  // in the POS top bar (see pos/src/App.jsx). Reuses the exact same
  // channel-scoped multiplier lookup already used for real earning (see
  // lib/buttons.js's getActiveMultiplierDetail and its use in this same
  // file's /checkout route) — this endpoint is purely a read-only display
  // of that same logic, not a separate source of truth, so the banner can
  // never show a different multiplier than what customers actually earn.
  // No customerId is passed, so this deliberately never reflects a
  // birthday bonus (that's per-customer, not something to show on a
  // general storefront badge) — only a real active campaign.
  router.get('/active-campaign', (req, res) => {
    const detail = getActiveMultiplierDetail(db, { channel: 'pos' });
    res.json({
      active: detail.source === 'campaign',
      multiplier: detail.multiplier,
      name: detail.campaignName,
    });
  });

  // GET /api/pos/catalogue — RRP only, includes barcode for scan-to-add.
  router.get('/catalogue', (req, res) => {
    const rows = db.query(`
      SELECT
        p.id, p.item_series, p.variation, p.image_data, p.barcode,
        p.price_rrp_sg,
        b.id AS brand_id, b.name AS brand_name, b.color AS brand_color,
        COALESCE(home.qty, 0)    AS home_qty,
        COALESCE(storhub.qty, 0) AS storhub_qty
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      LEFT JOIN inventory_levels home    ON home.product_id = p.id    AND home.location    = 'Home'
      LEFT JOIN inventory_levels storhub ON storhub.product_id = p.id AND storhub.location = 'Storhub'
      WHERE p.is_active = 1
      ORDER BY b.name, COALESCE(p.portal_sort_order, 999999), p.item_series, p.variation
    `);

    const catalogue = rows.map(r => ({
      id: r.id,
      brand_id: r.brand_id,
      brand_name: r.brand_name,
      brand_color: r.brand_color,
      item_series: r.item_series,
      variation: r.variation,
      barcode: r.barcode,
      image_data: r.image_data || null,
      price_rrp_sg: r.price_rrp_sg,
      stock_status: stockStatus(r.home_qty + r.storhub_qty),
    }));

    res.json(catalogue);
  });

  // POST /api/pos/checkout — the "Thank you!" button. Writes real sales
  // rows immediately (channel 'Event Sale', same as the internal Event
  // Sale tab), deducts inventory the same way every other sale does, and
  // returns straight away. No portal_orders row, no pending-approval step,
  // no notification — this is meant to feel instant at a live event.
  router.post('/checkout', (req, res) => {
    const { items, shipping_charged, shipping_cost, notes, mailing_name, mailing_address, mailing_phone, shipping_channel, customer_email, pdpa_consent, pdpa_consent_text } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty.' });
    }

    // If an email is being collected, PDPA consent must be given for it —
    // defense-in-depth in case a future caller (e.g. the new website) skips
    // the frontend checkbox validation. No email, no consent needed.
    if (customer_email && customer_email.trim() && !pdpa_consent) {
      return res.status(400).json({ error: 'PDPA consent is required to save a customer email.' });
    }

    // Same defense-in-depth stock validation as the Order Portal.
    for (const line of items) {
      const qty = parseInt(line.qty);
      if (!line.product_id || !qty || qty <= 0) {
        return res.status(400).json({ error: 'Each item needs a valid product and quantity.' });
      }
      const product = db.queryOne(`
        SELECT p.id, p.is_active, p.item_series, p.variation, p.unit_cost, p.price_rrp_sg,
          COALESCE(home.qty, 0) + COALESCE(storhub.qty, 0) AS total_qty
        FROM products p
        LEFT JOIN inventory_levels home    ON home.product_id = p.id    AND home.location    = 'Home'
        LEFT JOIN inventory_levels storhub ON storhub.product_id = p.id AND storhub.location = 'Storhub'
        WHERE p.id = ?
      `, [line.product_id]);
      if (!product || !product.is_active) {
        return res.status(400).json({ error: 'One of the items is no longer available.' });
      }
      if (qty > product.total_qty) {
        const name = `${product.item_series}${product.variation ? ' · ' + product.variation : ''}`;
        return res.status(400).json({ error: `Only ${product.total_qty} unit${product.total_qty === 1 ? '' : 's'} of "${name}" available.` });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const shipCharged = parseFloat(shipping_charged) || 0;
    const shipCost = parseFloat(shipping_cost) || 0;
    const hasMailing = !!(mailing_name || mailing_address || mailing_phone);
    const hasConsentedEmail = !!(customer_email && customer_email.trim() && pdpa_consent);
    const consentTimestamp = hasConsentedEmail ? new Date().toISOString() : null;

    // Turn a consented POS email into a real customer account (creates a
    // new unverified one, or just refreshes contact details on a returning
    // email — never re-issues the signup bonus twice). Runs once per
    // checkout, not once per line item. Wrapped defensively: a bug here
    // should never block a customer's in-person sale from completing —
    // it's logged loudly so it doesn't fail silently, but checkout proceeds
    // either way. The sales row itself (below) is still the source of
    // truth for what was actually sold either way.
    //
    // resolvedCustomer is used below (after the sales rows exist) to decide
    // whether this checkout earns BUTTONS right away: only if the account
    // is already verified. An unverified account (new signup at this event,
    // or a returning customer who never verified) earns nothing here — see
    // the comment further down for why, and where it actually gets
    // credited instead.
    let resolvedCustomer = null;
    if (hasConsentedEmail) {
      try {
        resolvedCustomer = upsertCustomerFromSignup(db, {
          email: customer_email, name: mailing_name, phone: mailing_phone, address: mailing_address,
          pdpa_consent_text, source: 'event',
        });
      } catch (err) {
        console.error('⚠️ Failed to create/update customer account from POS checkout (sale still proceeding):', err);
      }
    }

    const saleIds = [];

    items.forEach((line, i) => {
      const qty = parseInt(line.qty);
      const product = db.queryOne('SELECT unit_cost, price_rrp_sg FROM products WHERE id = ?', [line.product_id]);
      const unitCost = product?.unit_cost || 0;
      // unit_price may arrive already net of a staff-applied discount (per-item
      // or universal, computed client-side in the Review Order screen). Fall
      // back to catalogue RRP if not supplied or not a sane number.
      const parsedPrice = parseFloat(line.unit_price);
      const unitPrice = Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : (product?.price_rrp_sg || 0);
      const isFirst = i === 0;
      const lineNotes = [notes || null, line.line_note || null].filter(Boolean).join(' | ') || null;

      const result = db.run(`
        INSERT INTO sales
          (date, product_id, partner_id, channel, market, qty, unit_cost, unit_price,
           platform_fee_pct, platform_fee_amt, shipping_charged, shipping_cost, notes,
           mailing_name, mailing_address, mailing_phone, shipping_channel,
           customer_email, pdpa_consent, pdpa_consent_text, pdpa_consent_at)
        VALUES (?,?,?,?,?,?,?,?,0,0,?,?,?,?,?,?,?,?,?,?,?)
      `, [
        today, line.product_id, null, 'Event Sale', 'SG', qty, unitCost, unitPrice,
        isFirst ? shipCharged : 0,
        isFirst ? shipCost : 0,
        lineNotes,
        hasMailing ? (mailing_name || null) : null,
        hasMailing ? (mailing_address || null) : null,
        hasMailing ? (mailing_phone || null) : null,
        shipping_channel?.trim() || null,
        hasConsentedEmail ? customer_email.trim() : null,
        hasConsentedEmail ? 1 : 0,
        hasConsentedEmail ? (pdpa_consent_text || null) : null,
        consentTimestamp,
      ]);
      saleIds.push(result.lastID);

      if (inventoryRouter?._recordMovement) {
        inventoryRouter._recordMovement({
          date: today, product_id: line.product_id, location: 'Home',
          type: 'Sale', qty_change: -qty, reference: `pos_${result.lastID}`,
        });
      }
    });

    // Group every line of this checkout under one shared reference (the
    // first line's own id) — mirrors website_order_id, and is what lets a
    // multi-item event purchase earn/void BUTTONS as one unit rather than
    // fragmenting per line. See server/database.js for the column, and
    // lib/buttons.js's recordPosCheckoutButtons for how it's used.
    const checkoutRef = saleIds[0];
    for (const id of saleIds) {
      db.run('UPDATE sales SET pos_checkout_ref = ? WHERE id = ?', [checkoutRef, id]);
    }

    // BUTTONS: only for an ALREADY-VERIFIED customer — credited right away,
    // same as a website order. An unverified account (brand new signup at
    // this event, or a returning customer who still hasn't verified from a
    // previous visit) earns nothing here; per KT's decision, purchase
    // BUTTONS for an unverified account are held until they actually verify
    // their email, at which point they're all credited retroactively in one
    // sweep — see completeToken() in routes/customers.js. This is a
    // deliberately different rule from the 7-day refund-hold (which still
    // applies on top, starting from whenever the BUTTONS actually get
    // recorded — immediately here, or at verification time there) — the
    // point of holding for verification is to never let purchase BUTTONS
    // become spendable on an account nobody's confirmed is real yet, same
    // spirit as why the signup bonus itself waits for verification.
    if (resolvedCustomer?.customer_id && resolvedCustomer.account_status === 'verified') {
      try {
        recordPosCheckoutButtons(db, { customerId: resolvedCustomer.customer_id, checkoutRef });
      } catch (err) {
        console.error('⚠️ Failed to record BUTTONS for POS checkout (sale still proceeding):', err);
      }
    }

    res.status(201).json({ ok: true, sale_ids: saleIds });
  });

  return router;
};
