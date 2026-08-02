// The BUTTONS earn/redeem engine — implements the rules from
// pawvy-buttons-spec.md. This is pure ledger logic with no HTTP awareness;
// routes (once the website exists) call into these functions.
//
// Not wired to any live caller yet — there's no website checkout to trigger
// a real purchase from. Built and tested via direct calls now so it's ready
// the moment that exists, same pattern as the schema (Patch 96) and auth
// (Patch 97) being built ahead of their eventual callers.

const { creditButtons, customerButtonsBalance } = require('./customers');

// Railway's server clock runs in UTC, but "today" and "this month" for
// every date-based rule here (birthday-month bonus, campaign start/end
// windows) need to mean Singapore's calendar day/month, not UTC's — they
// can disagree by up to 8 hours around midnight either direction. Using
// Intl with an explicit timeZone works regardless of what timezone the
// server's OS is actually set to, rather than relying on server config.
function singaporeMonth(date) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Singapore', month: 'numeric' }).format(date)) - 1;
}
function singaporeDateStr(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(date); // en-CA -> YYYY-MM-DD
}

const REDEMPTION_CAP_PCT = 0.30;   // max 30% of order value can be paid with B
const B_VALUE_DOLLARS = 0.02;      // 100B = $2, i.e. 1B = $0.02
const HOLD_DAYS = 7;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const FIRST_PURCHASE_BONUS_B = 100;
const REFERRAL_BONUS_B = 150;

function buttonsToDollars(b) { return Math.round(b * B_VALUE_DOLLARS * 100) / 100; }
function dollarsToButtons(d) { return Math.floor(d / B_VALUE_DOLLARS); }

// The one earn formula agreed in the spec: B earned = round(amount actually
// paid for products), where "amount paid" = subtotal - discount - B
// redeemed, and shipping is never included. A multiplier (campaign or
// birthday-month, never both — see getActiveMultiplier) applies on top.
// Standard rounding (0.5 rounds up), matching Math.round's behavior for
// positive numbers.
function calculateEarnedButtons({ subtotal, discountAmount = 0, redeemedValue = 0, multiplier = 1 }) {
  const paid = Math.max(0, subtotal - discountAmount - redeemedValue);
  return Math.round(paid * multiplier);
}

// Higher of campaign multiplier or birthday-month multiplier — never
// stacked, per the agreed rule. Birthday multiplier is keyed off the
// customer's PRIMARY pet only (is_primary=1), not any pet they've
// registered — see the multi-pet decision after Patch 96.
function getActiveMultiplier(db, { customerId, onDate = new Date() } = {}) {
  return getActiveMultiplierDetail(db, { customerId, onDate }).multiplier;
}

// Same lookup as getActiveMultiplier, but returns which source won (for
// display purposes — e.g. the website telling a customer *why* they're
// earning extra BUTTONS right now) rather than just the bare number.
// Kept as a separate function so the actual earn-calculation code path
// (recordPurchaseButtons -> getActiveMultiplier) is untouched by this —
// this is purely additive, read-only display info.
function getActiveMultiplierDetail(db, { customerId, onDate = new Date() } = {}) {
  const dateStr = singaporeDateStr(onDate);

  const campaign = db.queryOne(`
    SELECT name, multiplier FROM campaigns
    WHERE is_active = 1 AND scope = 'site_wide' AND start_date <= ? AND end_date >= ?
    ORDER BY multiplier DESC LIMIT 1
  `, [dateStr, dateStr]);
  const campaignMultiplier = campaign ? campaign.multiplier : 1;

  let birthdayMultiplier = 1;
  if (customerId) {
    const pet = db.queryOne(
      `SELECT birthday FROM customer_pets WHERE customer_id = ? AND is_primary = 1 LIMIT 1`,
      [customerId]
    );
    if (pet?.birthday) {
      const petMonth = singaporeMonth(new Date(pet.birthday));
      if (petMonth === singaporeMonth(onDate)) birthdayMultiplier = 1.5;
    }
  }

  if (campaignMultiplier >= birthdayMultiplier && campaignMultiplier > 1) {
    return { multiplier: campaignMultiplier, source: 'campaign', campaignName: campaign.name };
  }
  if (birthdayMultiplier > 1) {
    return { multiplier: birthdayMultiplier, source: 'birthday', campaignName: null };
  }
  return { multiplier: 1, source: null, campaignName: null };
}

// Redeems B against an order. Enforces the 30% cap (silently reduces the
// request to the max allowed rather than erroring — a caller asking to
// redeem more than allowed is a UI bug, not something that should block
// checkout), draws down the customer's oldest CREDITED, non-expired
// batches first (FIFO), and records the redemption + per-batch audit trail.
// Returns how much was actually redeemed, which may be less than requested
// if the cap or the customer's balance was the binding constraint.
function redeemButtons(db, { customerId, requestedB, orderValueAfterDiscount, sourceType, sourceId }) {
  if (!requestedB || requestedB <= 0) return { redeemed: 0, redemptionValue: 0, capped: false };

  const maxValue = orderValueAfterDiscount * REDEMPTION_CAP_PCT;
  const maxB = dollarsToButtons(maxValue);
  const capped = requestedB > maxB;
  const target = Math.min(requestedB, maxB);
  if (target <= 0) return { redeemed: 0, redemptionValue: 0, capped };

  const availableBatches = db.query(`
    SELECT id, remaining FROM buttons_batches
    WHERE customer_id = ? AND status = 'credited' AND remaining > 0
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    ORDER BY credited_at ASC, id ASC
  `, [customerId]);

  let stillNeeded = target;
  const draws = [];
  for (const batch of availableBatches) {
    if (stillNeeded <= 0) break;
    const take = Math.min(batch.remaining, stillNeeded);
    draws.push({ batchId: batch.id, amount: take });
    stillNeeded -= take;
  }

  const actuallyRedeemed = target - stillNeeded; // less than target if balance was insufficient
  if (actuallyRedeemed <= 0) return { redeemed: 0, redemptionValue: 0, capped };

  const redemptionResult = db.run(`
    INSERT INTO buttons_redemptions (customer_id, source_type, source_id, amount)
    VALUES (?, ?, ?, ?)
  `, [customerId, sourceType, sourceId, actuallyRedeemed]);
  const redemptionId = redemptionResult.lastID;

  for (const draw of draws) {
    db.run(`
      INSERT INTO buttons_batch_redemptions (redemption_id, batch_id, amount) VALUES (?, ?, ?)
    `, [redemptionId, draw.batchId, draw.amount]);
    db.run(`UPDATE buttons_batches SET remaining = remaining - ? WHERE id = ?`, [draw.amount, draw.batchId]);
  }

  return { redeemed: actuallyRedeemed, redemptionValue: buttonsToDollars(actuallyRedeemed), capped };
}

// Non-committing preview of what redeemButtons() would actually redeem —
// used at Stripe Checkout Session creation time (server/routes/checkout.js)
// to size the discount correctly, WITHOUT touching the ledger. The real
// redemption (the DB writes redeemButtons performs) only happens in the
// webhook once Stripe confirms payment — never at session creation, same
// reasoning as why inventory/sales aren't committed until then either.
// Mirrors redeemButtons' cap + balance logic exactly so the previewed
// number always matches what actually gets redeemed on success.
function previewRedemption(db, { customerId, requestedB, orderValueAfterDiscount }) {
  if (!customerId || !requestedB || requestedB <= 0) return { redeemed: 0, redemptionValue: 0, capped: false };
  const maxValue = orderValueAfterDiscount * REDEMPTION_CAP_PCT;
  const maxB = dollarsToButtons(maxValue);
  const balance = customerButtonsBalance(db, customerId);
  const redeemed = Math.max(0, Math.min(requestedB, maxB, balance));
  const capped = requestedB > maxB || requestedB > balance;
  return { redeemed, redemptionValue: buttonsToDollars(redeemed), capped };
}

// Records B earned from a completed purchase. Everything created here goes
// in as status='pending' — subject to the 7-day hold (see
// processExpiredHolds) — because it's all purchase-contingent, per the
// spec's Section 8 scope decision. The flat 150B signup bonus is NOT
// handled here; that's credited directly on verification (see
// lib/customers.js), since it isn't tied to any transaction.
function recordPurchaseButtons(db, {
  customerId, subtotal, discountAmount = 0, redeemedValue = 0,
  sourceType, sourceId, isFirstPurchase = false, isRefereeFirstPurchase = false,
}) {
  const multiplier = getActiveMultiplier(db, { customerId });
  const earned = calculateEarnedButtons({ subtotal, discountAmount, redeemedValue, multiplier });

  const batchIds = [];
  if (earned > 0) {
    batchIds.push(creditButtons(db, {
      customer_id: customerId, amount: earned, source: 'purchase',
      source_type: sourceType, source_id: sourceId, status: 'pending',
    }));
  }
  if (isFirstPurchase) {
    batchIds.push(creditButtons(db, {
      customer_id: customerId, amount: FIRST_PURCHASE_BONUS_B, source: 'first_purchase_bonus',
      source_type: sourceType, source_id: sourceId, status: 'pending',
    }));
  }
  if (isRefereeFirstPurchase) {
    const customer = db.queryOne('SELECT referred_by_customer_id FROM customers WHERE id = ?', [customerId]);
    if (customer?.referred_by_customer_id) {
      batchIds.push(creditButtons(db, {
        customer_id: customerId, amount: REFERRAL_BONUS_B, source: 'referral',
        source_type: sourceType, source_id: sourceId, status: 'pending',
      }));
      batchIds.push(creditButtons(db, {
        customer_id: customer.referred_by_customer_id, amount: REFERRAL_BONUS_B, source: 'referral',
        source_type: sourceType, source_id: sourceId, status: 'pending',
      }));
    }
  }
  return { earned, multiplier, batchIds: batchIds.filter(Boolean) };
}

// The 7-day hold job. Any pending batch whose earned_at is more than 7 days
// old (and hasn't been voided by a refund in the meantime — see
// voidPendingButtons) becomes spendable: status flips to 'credited',
// credited_at is set to now, and expires_at is set to 1 year from now (not
// from earned_at — the spec is explicit that expiry counts from when B
// actually becomes usable, not when it was originally earned).
function processExpiredHolds(db) {
  const cutoff = new Date(Date.now() - HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const due = db.query(`SELECT id FROM buttons_batches WHERE status = 'pending' AND earned_at <= ?`, [cutoff]);

  const creditedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ONE_YEAR_MS).toISOString();
  for (const batch of due) {
    db.run(`UPDATE buttons_batches SET status = 'credited', credited_at = ?, expires_at = ? WHERE id = ?`,
      [creditedAt, expiresAt, batch.id]);
  }
  return { creditedCount: due.length };
}

// For refunds within the 7-day hold window — marks any still-pending
// batches tied to that transaction as voided (kept for audit, not deleted).
// If a refund happens AFTER the hold window (batches already credited),
// this deliberately does nothing — per the spec, B from a purchase that
// survived the 7-day window is treated as earned regardless of a later
// return, since clawing back already-spendable B is the harder problem
// the hold was specifically designed to avoid needing.
function voidPendingButtons(db, { sourceType, sourceId }) {
  const result = db.run(`
    UPDATE buttons_batches SET status = 'voided'
    WHERE source_type = ? AND source_id = ? AND status = 'pending'
  `, [sourceType, sourceId]);
  return { voided: result.changes };
}

module.exports = {
  calculateEarnedButtons, getActiveMultiplier, getActiveMultiplierDetail, redeemButtons, previewRedemption, recordPurchaseButtons,
  processExpiredHolds, voidPendingButtons, buttonsToDollars, dollarsToButtons,
  REDEMPTION_CAP_PCT, B_VALUE_DOLLARS, HOLD_DAYS, FIRST_PURCHASE_BONUS_B, REFERRAL_BONUS_B,
};
