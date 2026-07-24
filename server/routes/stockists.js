const { Router } = require('express');

// Public stockist directory for the website. Mounted at /api/stockists,
// added to the PIN-gate exclusion list alongside /shop and /customers.
//
// Deliberately hand-picks which columns to expose — NEVER `SELECT *` on
// the partners table. That table also holds real B2B commercial terms
// (tier, discount_type, discount_value, billing_cycle, credit_term_days)
// that must never reach a public endpoint. Checked the actual schema
// directly before writing this query, rather than assuming.
//
// No maps/geocoding API used anywhere here — region is a plain tag staff
// assign per partner (Central/East/North/North-East/West), matching
// Singapore's standard URA planning regions. Each result includes a plain
// Google Maps search link built from the address text — that's just a
// URL, not an API call, so it's genuinely free and needs no key.
module.exports = function(db) {
  const router = Router();

  // GET /api/stockists?brand_id=&region= — filterable list.
  router.get('/', (req, res) => {
    const { brand_id, region } = req.query;

    let sql = `
      SELECT DISTINCT p.id, p.company_name, p.address, p.phone, p.region
      FROM partners p
    `;
    const params = [];

    if (brand_id) {
      sql += ` JOIN partner_brands pb ON pb.partner_id = p.id AND pb.brand_id = ? `;
      params.push(brand_id);
    }

    sql += ` WHERE p.is_active = 1 AND COALESCE(p.tier, 'Active') != 'Non-active' AND p.market = 'SG' `;
    if (region) { sql += ` AND p.region = ? `; params.push(region); }

    sql += ` ORDER BY p.company_name `;

    const partners = db.query(sql, params);

    // Attach each partner's full brand list (not just the filtered-on
    // brand, if any) — a stockist carrying 3 of your 6 brands should show
    // all 3, so customers know what else is available there.
    const withBrands = partners.map(p => {
      const brands = db.query(`
        SELECT b.name, b.color FROM partner_brands pb
        JOIN brands b ON b.id = pb.brand_id
        WHERE pb.partner_id = ?
        ORDER BY b.name
      `, [p.id]);
      return { ...p, brands };
    });

    res.json({ stockists: withBrands });
  });

  // GET /api/stockists/regions — the 5 Singapore URA regions, for the
  // filter dropdown. Static, but served from here so the frontend doesn't
  // need to hardcode/duplicate this list.
  router.get('/regions', (req, res) => {
    res.json({ regions: ['Central', 'East', 'North', 'North-East', 'West'] });
  });

  return router;
};
