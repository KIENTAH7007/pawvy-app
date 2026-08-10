// Shared between routes/checkout.js (the webhook handler's quick
// best-effort attempt) and jobs/stripeFeeRefresh.js (the daily
// follow-up that catches the ones the webhook attempt missed — see that
// file for why this needs a second pass at all: PayNow specifically can
// take ~2 days to settle, confirmed against a real transaction, so a
// few seconds of retry at webhook time was never going to be enough on
// its own).
async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchStripeFee(stripeClient, paymentIntentId, { attempts = 1, delayMs = 1500 } = {}) {
  if (!paymentIntentId) return null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const pi = await stripeClient.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge.balance_transaction'],
      });
      const feeCents = pi?.latest_charge?.balance_transaction?.fee;
      if (typeof feeCents === 'number') return Math.round(feeCents) / 100;
    } catch (err) {
      console.warn(`⚠️  Stripe fee fetch attempt ${attempt} failed for ${paymentIntentId} — ${err.message}`);
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  return null; // still not available — caller decides what that means
}

module.exports = { fetchStripeFee };
