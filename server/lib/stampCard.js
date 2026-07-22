// Digital stamp card logic — see pawvy-buttons-spec.md Section 5.
// Every 5 stamps = 100B (immediate, not purchase-contingent — a stamp is
// manually approved by staff after checking a real public post, so unlike
// purchase-earned B there's no refund risk to hold against). Capped at
// 7 stamps/week per customer.
//
// Deliberately computed from raw stamp_events rows, not a running counter
// column — same reasoning as the schema comment in database.js: this
// codebase already hit a real counter-drift bug once (Patch 92's sign-flip
// issue), so derived state gets computed from source-of-truth events at
// read time instead of trusted as a stored number.

const { creditButtons } = require('./customers');

const STAMPS_PER_REWARD = 5;
const REWARD_B = 100;
const WEEKLY_STAMP_CAP = 7;

function getStampCount(db, customerId) {
  return db.queryOne('SELECT COUNT(*) AS c FROM stamp_events WHERE customer_id = ?', [customerId]).c;
}

// Rolling 7-day window, not calendar-week — consistent with how the rest
// of the BUTTONS system treats time periods as rolling from an event
// (e.g. 1-year expiry from credited_at), not calendar-boundary-based.
function getStampsInLastWeek(db, customerId) {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return db.queryOne('SELECT COUNT(*) AS c FROM stamp_events WHERE customer_id = ? AND created_at >= ?', [customerId, cutoff]).c;
}

// Records a new stamp (staff-approved, after checking a real tagged post —
// see the admin endpoint in customerAdmin.js for where approvedBy/note
// come from) and credits a 100B reward if this stamp crosses a new
// 5-stamp threshold. Throws if the weekly cap is already reached — the
// caller (an HTTP endpoint) is expected to catch and turn this into a 400,
// same pattern as other validation errors in this codebase.
function awardStamp(db, { customerId, approvedBy, note }) {
  const stampsThisWeekBefore = getStampsInLastWeek(db, customerId);
  if (stampsThisWeekBefore >= WEEKLY_STAMP_CAP) {
    const err = new Error(`Weekly stamp cap already reached (${WEEKLY_STAMP_CAP}/week).`);
    err.code = 'WEEKLY_CAP_REACHED';
    throw err;
  }

  db.run('INSERT INTO stamp_events (customer_id, approved_by, note) VALUES (?, ?, ?)', [customerId, approvedBy || null, note || null]);

  const totalStamps = getStampCount(db, customerId);
  const rewardsAlreadyPaid = db.queryOne(
    `SELECT COUNT(*) AS c FROM buttons_batches WHERE customer_id = ? AND source = 'stamp_card'`,
    [customerId]
  ).c;
  const rewardsEarned = Math.floor(totalStamps / STAMPS_PER_REWARD);
  const newRewards = Math.max(0, rewardsEarned - rewardsAlreadyPaid);

  for (let i = 0; i < newRewards; i++) {
    creditButtons(db, { customer_id: customerId, amount: REWARD_B, source: 'stamp_card', status: 'credited' });
  }

  const nextRewardAt = (Math.floor(totalStamps / STAMPS_PER_REWARD) + 1) * STAMPS_PER_REWARD;

  return {
    totalStamps,
    stampsThisWeek: stampsThisWeekBefore + 1,
    stampsUntilNextReward: nextRewardAt - totalStamps,
    rewardsCredited: newRewards,
  };
}

module.exports = { awardStamp, getStampCount, getStampsInLastWeek, STAMPS_PER_REWARD, REWARD_B, WEEKLY_STAMP_CAP };
