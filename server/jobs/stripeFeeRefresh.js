const { fetchStripeFee } = require('../lib/stripeFees');

// Daily follow-up for Stripe processing fees the webhook handler
// (routes/checkout.js) couldn't fetch yet at payment time. Confirmed
// against a real transaction (Aug 2026): PayNow's fee doesn't become
// available via the API until Stripe actually settles the transaction —
// ~2 days later, per that payment's own "Funds available" timestamp in
// the Stripe Dashboard — so the webhook's few-seconds-of-retry was never
// going to catch it. Card payments almost always get the fee
// immediately at webhook time and never need this job at all; this only
// ever touches the PayNow (or otherwise delayed) stragglers.
//
// Only ever updates ONE sales row per order — matching the existing
// convention in checkout.js's fulfillOrder (the fee is carried on just
// the first line item of a multi-item order, to avoid double-counting
// it if a report sums across every line). Picks the lowest sales.id for
// that order as "the first line item", same as insertion order would
// have produced originally.
//
// Only looks at orders from the last 21 days — long enough to comfortably
// cover any real settlement delay, short enough that this doesn't spend
// forever re-checking orders where the fee, for whatever genuine reason,
// never populates (a cancelled/disputed charge, for instance).
const LOOKBACK_DAYS = 21;

async function runStripeFeeRefresh(db, stripeClient) {
  const candidates = db.query(`
    SELECT MIN(s.id) as sale_id, s.website_order_id, wo.stripe_payment_intent_id
    FROM sales s
    JOIN website_orders wo ON wo.id = s.website_order_id
    WHERE s.stripe_fee_amt = 0
      AND wo.stripe_payment_intent_id IS NOT NULL
      AND s.website_order_id IS NOT NULL
      AND s.date >= date('now', '-${LOOKBACK_DAYS} days')
    GROUP BY s.website_order_id
  `);

  if (candidates.length === 0) return { updated: 0, stillPending: 0 };

  console.log(`💳 Checking ${candidates.length} website order(s) for a settled Stripe fee…`);
  let updated = 0, stillPending = 0;

  for (const row of candidates) {
    const fee = await fetchStripeFee(stripeClient, row.stripe_payment_intent_id, { attempts: 1 });
    if (fee === null) {
      stillPending++;
      continue;
    }
    db.run('UPDATE sales SET stripe_fee_amt = ? WHERE id = ?', [fee, row.sale_id]);
    updated++;
  }

  console.log(`💳 Stripe fee refresh: ${updated} updated, ${stillPending} still pending (will retry tomorrow).`);
  return { updated, stillPending };
}

module.exports = { runStripeFeeRefresh };
