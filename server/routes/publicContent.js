const { Router } = require('express');
const { getActiveMultiplierDetail } = require('../lib/buttons');

// Read-only content the public website needs, mounted at /api/public-content
// and excluded from the staff PIN gate in server/index.js (same pattern as
// /api/shop, /api/stockists, etc.) — real website visitors reach this with
// no login. Deliberately kept separate from the staff-only CRUD routes
// (routes/campaigns.js, routes/tickerMessages.js) so this can never
// accidentally leak inactive campaigns, past ticker messages, or anything
// else not meant for public eyes — only the two specific "what's active
// right now" shapes below are exposed.
module.exports = function(db) {
  const router = Router();

  router.get('/ticker', (req, res) => {
    const messages = db.query(
      'SELECT text FROM ticker_messages WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
    );
    res.json({ messages: messages.map(m => m.text) });
  });

  // Whether a site-wide campaign is active right now, and its multiplier —
  // used for the nav's promo badge. Deliberately NOT customer-specific
  // (no auth here), so this only ever reflects a campaign, never a given
  // customer's birthday-month bonus (that's customer-specific and already
  // covered by GET /api/customers/me for logged-in customers).
  router.get('/campaign', (req, res) => {
    const detail = getActiveMultiplierDetail(db, {});
    if (detail.source === 'campaign') {
      res.json({ active: true, name: detail.campaignName, multiplier: detail.multiplier });
    } else {
      res.json({ active: false });
    }
  });

  return router;
};
