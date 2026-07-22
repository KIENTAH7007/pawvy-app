const { processExpiredHolds } = require('../lib/buttons');

// Daily check for BUTTONS batches whose 7-day refund-hold window has
// passed — flips them from 'pending' to 'credited' (spendable), with
// expires_at set to 1 year from now. See pawvy-buttons-spec.md Section 8
// for why the hold exists (avoids needing refund-clawback logic entirely)
// and lib/buttons.js's processExpiredHolds for the actual logic — this
// file is just the daily trigger.
async function runButtonsHoldCheck(db) {
  const { creditedCount } = processExpiredHolds(db);
  if (creditedCount > 0) {
    console.log(`✅ BUTTONS hold check: ${creditedCount} batch${creditedCount === 1 ? '' : 'es'} credited (7-day hold passed)`);
  }
}

module.exports = { runButtonsHoldCheck };
