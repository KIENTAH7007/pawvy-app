const { getBestActiveCampaign, singaporeDateStr, singaporeMonth } = require('../lib/buttons');
const { buildButtonsExpiryEmail, buildBirthdayEmail, buildCampaignEmail } = require('../lib/customerEmails');
const { sendCustomerEmail } = require('../utils/notify');

// Daily trigger for the two new automated reminder emails, agreed in the
// Aug 2026 email-redesign thread. Same shape as buttonsHold.js (daily
// trigger file, real logic lives in lib/*.js) — this file is the trigger
// + per-customer send loop, kept deliberately dumb so the actual rules
// live in one place each (getBestActiveCampaign in lib/buttons.js,
// email content in lib/customerEmails.js).
//
// Both reminders only ever go to account_status = 'verified' customers —
// an unverified signup hasn't confirmed their email is real yet, so
// there's nothing to remind them about (no credited BUTTONS, no
// meaningful account).

const EXPIRY_WARNING_DAYS = 14;
const EXPIRY_ROLLUP_LIMIT = 3;

// ── 1. BUTTONS expiry rollup ─────────────────────────────────────────
// Fires once PER BATCH, the first day that batch is within
// EXPIRY_WARNING_DAYS of its expires_at — never a recurring daily nag for
// the same batch. Batches already logged are excluded from the candidate
// query below, so this is naturally idempotent day over day. Multiple
// qualifying batches for the same customer are rolled into a single email
// (top 3 soonest-expiring) rather than one email each — if a customer has
// more than 3 batches enter the window on the same day, the remaining
// ones roll into a follow-up email on a later run once the first 3 are
// marked notified (each batch is only ever included in exactly one
// email).
async function runButtonsExpiryReminder(db) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  const candidates = db.query(`
    SELECT bb.id, bb.customer_id, bb.amount, bb.remaining, bb.expires_at
    FROM buttons_batches bb
    JOIN customers c ON c.id = bb.customer_id
    WHERE bb.status = 'credited'
      AND bb.remaining > 0
      AND bb.expires_at IS NOT NULL
      AND bb.expires_at > ?
      AND bb.expires_at <= ?
      AND c.account_status = 'verified'
      AND bb.id NOT IN (
        SELECT reference_id FROM automated_email_log
        WHERE email_type = 'buttons_expiry' AND reference_id IS NOT NULL
      )
    ORDER BY bb.customer_id, bb.expires_at ASC
  `, [nowIso, windowEnd]);

  const byCustomer = new Map();
  for (const row of candidates) {
    if (!byCustomer.has(row.customer_id)) byCustomer.set(row.customer_id, []);
    byCustomer.get(row.customer_id).push(row);
  }

  let sentCount = 0;
  for (const [customerId, batches] of byCustomer) {
    const topBatches = batches.slice(0, EXPIRY_ROLLUP_LIMIT);
    const customer = db.queryOne('SELECT id, name, email FROM customers WHERE id = ?', [customerId]);
    if (!customer?.email) continue;

    const { subject, text, html } = buildButtonsExpiryEmail(customer, topBatches);
    const ok = await sendCustomerEmail(customer.email, subject, text, html);
    if (ok) {
      for (const b of topBatches) {
        db.run(`INSERT INTO automated_email_log (customer_id, email_type, reference_id) VALUES (?, 'buttons_expiry', ?)`, [customerId, b.id]);
      }
      sentCount++;
    }
  }
  return { sentCount };
}

// ── 2. Campaign / birthday-month reminder ────────────────────────────
// Per customer, per day: work out whether a birthday bonus (1.5x, primary
// pet's birthday month) or the single best currently-active campaign
// applies — using the exact same "higher wins, ties go to the campaign"
// rule as the real earn-time logic in getActiveMultiplierDetail, just
// re-derived here since that function is channel-scoped for checkout and
// this needs the channel-agnostic "best campaign right now" version
// (getBestActiveCampaign). Sends AT MOST ONE of the two emails — never
// both — matching the "never stacked" rule.
async function runCampaignBirthdayReminder(db) {
  const now = new Date();
  const todayStr = singaporeDateStr(now);
  const currentYear = todayStr.slice(0, 4);
  const currentMonth = singaporeMonth(now);

  const bestCampaign = getBestActiveCampaign(db, now);
  const campaignMultiplier = bestCampaign ? bestCampaign.multiplier : 1;

  const verifiedCustomers = db.query(`SELECT id, name, email FROM customers WHERE account_status = 'verified'`);

  let sentBirthday = 0;
  let sentCampaign = 0;

  for (const customer of verifiedCustomers) {
    if (!customer.email) continue;

    const primaryPet = db.queryOne(
      `SELECT name, birthday FROM customer_pets WHERE customer_id = ? AND is_primary = 1 LIMIT 1`,
      [customer.id]
    );
    let birthdayMultiplier = 1;
    if (primaryPet?.birthday && singaporeMonth(new Date(primaryPet.birthday)) === currentMonth) {
      birthdayMultiplier = 1.5;
    }

    // Same tie rule as getActiveMultiplierDetail: campaign wins on >=.
    if (campaignMultiplier >= birthdayMultiplier && campaignMultiplier > 1) {
      if (!bestCampaign.email_frequency_days || bestCampaign.email_frequency_days <= 0) continue; // opt-in only

      const lastSent = db.queryOne(`
        SELECT sent_at FROM automated_email_log
        WHERE customer_id = ? AND email_type = 'campaign' AND reference_id = ?
        ORDER BY sent_at DESC LIMIT 1
      `, [customer.id, bestCampaign.id]);

      const daysSinceLast = lastSent
        ? Math.floor((now - new Date(lastSent.sent_at)) / (24 * 60 * 60 * 1000))
        : Infinity;

      if (daysSinceLast >= bestCampaign.email_frequency_days) {
        const { subject, text, html } = buildCampaignEmail(customer, bestCampaign);
        const ok = await sendCustomerEmail(customer.email, subject, text, html);
        if (ok) {
          db.run(`INSERT INTO automated_email_log (customer_id, email_type, reference_id) VALUES (?, 'campaign', ?)`, [customer.id, bestCampaign.id]);
          sentCampaign++;
        }
      }
    } else if (birthdayMultiplier > 1) {
      const alreadySentThisYear = db.queryOne(`
        SELECT id FROM automated_email_log
        WHERE customer_id = ? AND email_type = 'birthday'
          AND strftime('%Y', sent_at) = ?
        LIMIT 1
      `, [customer.id, currentYear]);
      if (alreadySentThisYear) continue;

      const { subject, text, html } = buildBirthdayEmail(customer, primaryPet);
      const ok = await sendCustomerEmail(customer.email, subject, text, html);
      if (ok) {
        db.run(`INSERT INTO automated_email_log (customer_id, email_type, reference_id) VALUES (?, 'birthday', NULL)`, [customer.id]);
        sentBirthday++;
      }
    }
    // else: no active bonus at all for this customer today — nothing to send.
  }

  return { sentBirthday, sentCampaign };
}

async function runCustomerReminders(db) {
  const expiryResult = await runButtonsExpiryReminder(db);
  if (expiryResult.sentCount > 0) {
    console.log(`✅ BUTTONS expiry reminder: ${expiryResult.sentCount} email${expiryResult.sentCount === 1 ? '' : 's'} sent`);
  }

  const campaignBirthdayResult = await runCampaignBirthdayReminder(db);
  if (campaignBirthdayResult.sentBirthday > 0 || campaignBirthdayResult.sentCampaign > 0) {
    console.log(`✅ Campaign/birthday reminder: ${campaignBirthdayResult.sentBirthday} birthday, ${campaignBirthdayResult.sentCampaign} campaign email(s) sent`);
  }
}

module.exports = { runCustomerReminders, runButtonsExpiryReminder, runCampaignBirthdayReminder };
