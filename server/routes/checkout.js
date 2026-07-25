const { Router } = require('express');
const { withEffectivePrice } = require('../lib/pricing');
const { previewRedemption, redeemButtons, recordPurchaseButtons } = require('../lib/buttons');
const { notifyNewWebsiteOrder } = require('../utils/notify');

// Real B2C checkout for pawvy.co, paid via Stripe Checkout (card + PayNow).
// Mounted at /api/checkout, added to the PIN-gate exclusion list in
// server/index.js — real website visitors (logged in or guest) need to
// reach this with no staff login.
//
// Key design decision, consistent with every other checkout-like flow in
// this app (Order Portal approval, POS checkout): nothing is committed —
// no inventory deducted, no `sales` row, no BUTTONS earned/redeemed — until
// payment is actually confirmed. A Checkout Session being *created* only
// writes a 'pending_payment' website_orders row; the webhook is what
// commits everything, exactly once, when Stripe confirms real money moved.
//
// `stripeClient` is injected (not required directly here) so this file can
// be unit-tested against a stub without hitting Stripe's real API — see
// server/index.js for the real `require('stripe')(...)` wiring.
module.exports = function(db, inventoryRouter, stripeClient) {
  const router = Router();

  const FREE_SHIPPING_THRESHOLD = 60; // must match app/cart/page.js on the website — see note there
  const SHIPPING_COST = 3;            // must match app/cart/page.js on the website — see note there
  const MIN_CHARGE_SGD = 0.50;        // Stripe's practical minimum for an SGD charge

  function requireEnv(name) {
    const val = process.env[name];
    if (!val) throw Object.assign(new Error(`${name} is not set on this deployment.`), { code: 'MISSING_ENV' });
    return val;
  }

  // Reads a customer session token if present, but never blocks the
  // request when absent or invalid — guest checkout is allowed. Mirrors
  // requireCustomerAuth in routes/customers.js but is deliberately optional.
  function attachOptionalCustomer(req) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return null;
    const record = db.queryOne(`
      SELECT * FROM auth_tokens WHERE token = ? AND purpose = 'session' AND expires_at > CURRENT_TIMESTAMP
    `, [token]);
    if (!record) return null;
    return db.queryOne('SELECT * FROM customers WHERE id = ?', [record.customer_id]);
  }

  // Validates + prices every line server-side against the real product
  // catalogue — the client's cart is never trusted for price or stock,
  // same defensive pattern as server/routes/pos.js's checkout.
  function priceAndValidateItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return { error: 'Cart is empty.' };
    }
    const priced = [];
    for (const line of items) {
      const qty = parseInt(line.qty);
      if (!line.product_id || !qty || qty <= 0) {
        return { error: 'Each item needs a valid product and quantity.' };
      }
      const product = db.queryOne(`
        SELECT p.id, p.is_active, p.item_series, p.variation, p.unit_cost,
          p.price_rrp_sg, p.discount_pct, p.discount_start, p.discount_end,
          b.name AS brand_name,
          COALESCE(home.qty, 0) + COALESCE(storhub.qty, 0) AS total_qty
        FROM products p
        JOIN brands b ON b.id = p.brand_id
        LEFT JOIN inventory_levels home    ON home.product_id = p.id    AND home.location    = 'Home'
        LEFT JOIN inventory_levels storhub ON storhub.product_id = p.id AND storhub.location = 'Storhub'
        WHERE p.id = ?
      `, [line.product_id]);

      if (!product || !product.is_active) {
        return { error: 'One of the items in your cart is no longer available.' };
      }
      if (qty > product.total_qty) {
        const name = `${product.item_series}${product.variation ? ' · ' + product.variation : ''}`;
        return { error: `Only ${product.total_qty} unit${product.total_qty === 1 ? '' : 's'} of "${name}" available.` };
      }

      const { effective_price_rrp_sg } = withEffectivePrice(product);
      priced.push({
        product_id: product.id, qty, unit_price: effective_price_rrp_sg, unit_cost: product.unit_cost,
        name: `${product.brand_name} — ${product.item_series}${product.variation ? ' · ' + product.variation : ''}`,
      });
    }
    const subtotal = Math.round(priced.reduce((s, l) => s + l.unit_price * l.qty, 0) * 100) / 100;
    return { items: priced, subtotal };
  }

  // POST /api/checkout/create-session
  router.post('/create-session', async (req, res) => {
    try {
      const websiteUrl = requireEnv('WEBSITE_URL');
      const customer = attachOptionalCustomer(req);

      const { items, shipping_address, buttons_redeem } = req.body;
      let { guest_email, guest_name, guest_phone, pdpa_consent, pdpa_consent_text } = req.body;

      if (!customer && (!guest_email || !guest_email.trim())) {
        return res.status(400).json({ error: 'Email is required to check out.' });
      }
      if (!customer && !pdpa_consent) {
        return res.status(400).json({ error: 'PDPA consent is required to check out as a guest.' });
      }

      const { items: pricedItems, subtotal, error: itemsError } = priceAndValidateItems(items);
      if (itemsError) return res.status(400).json({ error: itemsError });

      const shippingAmount = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;

      let redemption = { redeemed: 0, redemptionValue: 0 };
      const requestedB = parseInt(buttons_redeem) || 0;
      if (customer && requestedB > 0) {
        redemption = previewRedemption(db, {
          customerId: customer.id, requestedB, orderValueAfterDiscount: subtotal,
        });
      }

      // Never allow a redemption that would take the charge below Stripe's
      // practical minimum — clamp the redemption down rather than error out,
      // same "reduce to the max allowed, don't block checkout" philosophy
      // as redeemButtons' own cap.
      const preClampTotal = subtotal + shippingAmount - redemption.redemptionValue;
      if (preClampTotal < MIN_CHARGE_SGD) {
        const maxAllowedRedemptionValue = Math.max(0, subtotal + shippingAmount - MIN_CHARGE_SGD);
        redemption = {
          redeemed: Math.floor(maxAllowedRedemptionValue / 0.02), // B_VALUE_DOLLARS inlined — see lib/buttons.js
          redemptionValue: Math.round(maxAllowedRedemptionValue * 100) / 100,
        };
      }

      const totalAmount = Math.round((subtotal + shippingAmount - redemption.redemptionValue) * 100) / 100;

      const customerEmail = customer ? customer.email : guest_email.trim();
      const customerName = customer ? customer.name : (guest_name || null);
      const customerPhone = customer ? customer.phone : (guest_phone || null);

      const orderResult = db.run(`
        INSERT INTO website_orders
          (customer_id, customer_email, customer_name, customer_phone, shipping_address,
           subtotal, shipping_amount, buttons_redeemed, buttons_redemption_value, total_amount,
           status, pdpa_consent, pdpa_consent_text)
        VALUES (?,?,?,?,?,?,?,?,?,?, 'pending_payment', ?, ?)
      `, [
        customer ? customer.id : null, customerEmail, customerName, customerPhone,
        shipping_address || null, subtotal, shippingAmount, redemption.redeemed, redemption.redemptionValue,
        totalAmount, customer ? 1 : (pdpa_consent ? 1 : 0), customer ? null : (pdpa_consent_text || null),
      ]);
      const orderId = orderResult.lastID;

      for (const line of pricedItems) {
        db.run(`
          INSERT INTO website_order_items (website_order_id, product_id, qty, unit_price)
          VALUES (?,?,?,?)
        `, [orderId, line.product_id, line.qty, line.unit_price]);
      }

      const line_items = pricedItems.map(l => ({
        price_data: {
          currency: 'sgd',
          product_data: { name: l.name },
          unit_amount: Math.round(l.unit_price * 100),
        },
        quantity: l.qty,
      }));
      if (shippingAmount > 0) {
        line_items.push({
          price_data: { currency: 'sgd', product_data: { name: 'Shipping' }, unit_amount: Math.round(shippingAmount * 100) },
          quantity: 1,
        });
      }

      let discounts;
      if (redemption.redemptionValue > 0) {
        const coupon = await stripeClient.coupons.create({
          amount_off: Math.round(redemption.redemptionValue * 100),
          currency: 'sgd',
          duration: 'once',
          name: 'Pawvy BUTTONS reward',
        });
        discounts = [{ coupon: coupon.id }];
      }

      const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ['card', 'paynow'],
        mode: 'payment',
        line_items,
        ...(discounts ? { discounts } : {}),
        customer_email: customerEmail,
        client_reference_id: String(orderId),
        metadata: { pawvy_order_id: String(orderId) },
        success_url: `${websiteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${websiteUrl}/cart`,
      });

      db.run('UPDATE website_orders SET stripe_checkout_session_id = ? WHERE id = ?', [session.id, orderId]);

      res.json({ ok: true, checkout_url: session.url, order_id: orderId });
    } catch (err) {
      if (err.code === 'MISSING_ENV') {
        console.error('⚠️  Checkout misconfigured:', err.message);
        return res.status(500).json({ error: 'Checkout is temporarily unavailable. Please try again shortly.' });
      }
      console.error('⚠️  create-session error:', err);
      res.status(500).json({ error: 'Something went wrong starting checkout. Please try again.' });
    }
  });

  // Commits a paid order exactly once: real `sales` rows, inventory
  // deduction, and BUTTONS earn/redeem. Safe to call more than once for the
  // same session (Stripe can and does send duplicate webhook events) — the
  // status check makes this idempotent.
  function fulfillOrder(session) {
    const order = db.queryOne('SELECT * FROM website_orders WHERE stripe_checkout_session_id = ?', [session.id]);
    if (!order) {
      console.error(`⚠️  Webhook: no website_orders row for Stripe session ${session.id}`);
      return;
    }
    if (order.status === 'paid') return; // already fulfilled — duplicate event, no-op

    const items = db.query('SELECT * FROM website_order_items WHERE website_order_id = ?', [order.id]);
    const today = new Date().toISOString().slice(0, 10);
    const saleIds = [];

    items.forEach((line, i) => {
      const product = db.queryOne('SELECT unit_cost FROM products WHERE id = ?', [line.product_id]);
      const isFirst = i === 0;

      const result = db.run(`
        INSERT INTO sales
          (date, product_id, partner_id, channel, market, qty, unit_cost, unit_price,
           platform_fee_pct, platform_fee_amt, shipping_charged, shipping_cost, notes,
           mailing_name, mailing_address, mailing_phone, customer_email,
           pdpa_consent, pdpa_consent_text, pdpa_consent_at)
        VALUES (?,?,?,?,?,?,?,?,0,0,?,0,?,?,?,?,?,?,?,?)
      `, [
        today, line.product_id, null, 'Website Order', 'SG', line.qty,
        product?.unit_cost || 0, line.unit_price,
        isFirst ? order.shipping_amount : 0,
        `Website Order #${order.id}`,
        order.customer_name || null, order.shipping_address || null, order.customer_phone || null,
        order.customer_email, order.pdpa_consent, order.pdpa_consent_text, order.created_at,
      ]);
      saleIds.push(result.lastID);

      if (inventoryRouter?._recordMovement) {
        // Note: stock was validated at Checkout Session creation but not
        // re-locked/reserved while the customer paid (same as every other
        // checkout flow in this app). If stock moved in the meantime this
        // can go negative — logged below, not blocked, since the payment
        // has already been captured and reversing it is the harder problem.
        const level = db.queryOne(`SELECT qty FROM inventory_levels WHERE product_id = ? AND location = 'Home'`, [line.product_id]);
        if ((level?.qty || 0) < line.qty) {
          console.warn(`⚠️  Website order #${order.id}: fulfilling ${line.qty}x product ${line.product_id} with only ${level?.qty || 0} in Home stock.`);
        }
        inventoryRouter._recordMovement({
          date: today, product_id: line.product_id, location: 'Home',
          type: 'Sale', qty_change: -line.qty, reference: `website_${result.lastID}`,
        });
      }
    });

    db.run(`
      UPDATE website_orders
      SET status = 'paid', paid_at = CURRENT_TIMESTAMP, stripe_payment_intent_id = ?, created_sale_ids = ?
      WHERE id = ?
    `, [session.payment_intent || null, saleIds.join(','), order.id]);

    if (order.customer_id) {
      const priorPaidOrder = db.queryOne(`
        SELECT id FROM website_orders WHERE customer_id = ? AND status = 'paid' AND id != ?
      `, [order.customer_id, order.id]);
      const isFirstPurchase = !priorPaidOrder;

      recordPurchaseButtons(db, {
        customerId: order.customer_id, subtotal: order.subtotal, discountAmount: 0,
        redeemedValue: order.buttons_redemption_value, sourceType: 'website_order', sourceId: order.id,
        isFirstPurchase, isRefereeFirstPurchase: isFirstPurchase,
      });

      if (order.buttons_redeemed > 0) {
        redeemButtons(db, {
          customerId: order.customer_id, requestedB: order.buttons_redeemed,
          orderValueAfterDiscount: order.subtotal, sourceType: 'website_order', sourceId: order.id,
        });
      }
    }

    const products = db.query(`
      SELECT woi.qty, p.item_series, p.variation
      FROM website_order_items woi JOIN products p ON p.id = woi.product_id
      WHERE woi.website_order_id = ?
    `, [order.id]);
    notifyNewWebsiteOrder({
      orderId: order.id, customerName: order.customer_name, customerEmail: order.customer_email,
      total: order.total_amount,
      lines: products.map(p => ({ qty: p.qty, name: `${p.item_series}${p.variation ? ' · ' + p.variation : ''}` })),
    });
  }

  // POST /api/checkout/webhook — Stripe's server-to-server confirmation.
  // Requires the RAW request body (not JSON-parsed) for signature
  // verification — see the path-based branch in server/index.js that skips
  // express.json() specifically for this route.
  router.post('/webhook', (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      const webhookSecret = requireEnv('STRIPE_WEBHOOK_SECRET');
      event = stripeClient.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('⚠️  Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          // For card payments this is already 'paid'; for PayNow (an async,
          // redirect-based method) it's often still 'unpaid' here — the
          // async_payment_succeeded event below is what actually confirms it.
          if (session.payment_status === 'paid') fulfillOrder(session);
          break;
        }
        case 'checkout.session.async_payment_succeeded':
          fulfillOrder(event.data.object);
          break;
        case 'checkout.session.async_payment_failed': {
          const session = event.data.object;
          db.run(`UPDATE website_orders SET status = 'payment_failed' WHERE stripe_checkout_session_id = ? AND status != 'paid'`, [session.id]);
          break;
        }
        default:
          break; // not an event type we act on
      }
      res.json({ received: true });
    } catch (err) {
      console.error('⚠️  Webhook handler error:', err);
      res.status(500).json({ error: 'Webhook handler failed.' });
    }
  });

  // GET /api/checkout/session/:sessionId — order confirmation lookup for
  // the website's success page. The Stripe session ID itself is the
  // effective lookup key (long, random, unguessable) — same trust model
  // Stripe's own success_url redirect relies on.
  router.get('/session/:sessionId', (req, res) => {
    const order = db.queryOne('SELECT * FROM website_orders WHERE stripe_checkout_session_id = ?', [req.params.sessionId]);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const items = db.query(`
      SELECT woi.qty, woi.unit_price, p.item_series, p.variation, b.name AS brand_name
      FROM website_order_items woi
      JOIN products p ON p.id = woi.product_id
      JOIN brands b ON b.id = p.brand_id
      WHERE woi.website_order_id = ?
    `, [order.id]);

    res.json({
      ok: true,
      order: {
        id: order.id, status: order.status, subtotal: order.subtotal, shipping_amount: order.shipping_amount,
        buttons_redeemed: order.buttons_redeemed, buttons_redemption_value: order.buttons_redemption_value,
        total_amount: order.total_amount, customer_email: order.customer_email,
      },
      items,
    });
  });

  return router;
};
