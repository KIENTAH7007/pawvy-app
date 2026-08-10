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

  // Whether a site-wide OR website-scoped campaign is active right now,
  // and its multiplier — used for the nav's promo badge, for visitors who
  // aren't logged in (logged-in customers get this same info, already
  // combined with their own birthday-month bonus, from GET
  // /api/customers/me instead). Deliberately not customer-specific (no
  // auth here) — this only ever reflects a campaign, never a birthday
  // bonus, which needs a known customer.
  //
  // channel: 'website' matters here too, same reasoning as customers.js's
  // /me endpoint — without it, a campaign scoped specifically to
  // "Website only" in the Campaigns admin would silently never show here.
  router.get('/campaign', (req, res) => {
    const detail = getActiveMultiplierDetail(db, { channel: 'website' });
    if (detail.source === 'campaign') {
      res.json({ active: true, name: detail.campaignName, multiplier: detail.multiplier });
    } else {
      res.json({ active: false });
    }
  });

  // Pawvy's own Instagram profile — used as the click-through fallback
  // below whenever a specific post's link_url wasn't set, so an image is
  // never a dead click.
  const PAWVY_INSTAGRAM_URL = 'https://instagram.com/pawvy_sg';

  router.get('/instagram', (req, res) => {
    const posts = db.query(
      "SELECT image_url, link_url FROM instagram_posts WHERE is_active = 1 AND image_url IS NOT NULL AND image_url != '' ORDER BY sort_order ASC, id ASC"
    );
    res.json({
      items: posts.map(p => ({ image: p.image_url, link: p.link_url || PAWVY_INSTAGRAM_URL })),
    });
  });

  // The homepage's full-width takeover banner (the "Wild Balance"-style new
  // brand announcement) — active means both is_active=1 AND today falls
  // within [start_date, end_date] (either bound can be left blank for
  // open-ended, same convention already used for campaigns and the New
  // badge). If no link_url was set for this specific banner, falls back to
  // the brand gallery so a click never dead-ends — same reasoning as the
  // Instagram fallback just above.
  router.get('/banner', (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const banner = db.queryOne(`
      SELECT image_url, headline, link_url FROM homepage_banners
      WHERE is_active = 1
        AND (start_date IS NULL OR start_date <= ?)
        AND (end_date IS NULL OR end_date >= ?)
        AND image_url IS NOT NULL AND image_url != ''
      ORDER BY id DESC LIMIT 1
    `, [today, today]);

    if (!banner) return res.json({ active: false });
    res.json({
      active: true,
      image: banner.image_url,
      headline: banner.headline || '',
      link: banner.link_url || '/#gallery',
    });
  });

  return router;
};
