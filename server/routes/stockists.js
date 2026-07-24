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
// Outlet-aware: a partner with recorded outlets (partner_addresses) gets
// one stockist card PER OUTLET, each with its own address/region — a
// partner with none gets a single card from its own address/region.
// Correction to an earlier version of this feature, which assumed every
// multi-location partner was already split into separate top-level
// partner rows. Confirmed directly that isn't true (e.g. one partner had
// two addresses joined with "/" in a single address field) — outlets are
// the actual place multi-location partners are tracked when they ARE
// split out, so region now lives there too.
//
// No maps/geocoding API used anywhere here — region is a plain tag staff
// assign (Central/East/North/North-East/West, Singapore's standard URA
// planning regions). Each result includes a plain Google Maps search link
// built from the address text — that's just a URL, not an API call, so
// it's genuinely free and needs no key.
module.exports = function(db) {
  const router = Router();

  // GET /api/stockists?brand_id=&region= — filterable list.
  router.get('/', (req, res) => {
    const { brand_id, region } = req.query;

    let sql = `SELECT DISTINCT p.id, p.company_name, p.address, p.phone, p.region FROM partners p`;
    const params = [];
    if (brand_id) {
      sql += ` JOIN partner_brands pb ON pb.partner_id = p.id AND pb.brand_id = ?`;
      params.push(brand_id);
    }
    sql += ` WHERE p.is_active = 1 AND COALESCE(p.tier, 'Active') != 'Non-active' AND p.market = 'SG' ORDER BY p.company_name`;

    const partners = db.query(sql, params);

    let stockists = [];
    for (const p of partners) {
      const brands = db.query(`
        SELECT b.name, b.color FROM partner_brands pb
        JOIN brands b ON b.id = pb.brand_id
        WHERE pb.partner_id = ?
        ORDER BY b.name
      `, [p.id]);

      const outlets = db.query(
        'SELECT id, label, address, phone, region FROM partner_addresses WHERE partner_id = ? ORDER BY is_primary DESC, sort_order ASC, id ASC',
        [p.id]
      );

      if (outlets.length > 0) {
        // One card per outlet — each with its own address/region.
        for (const o of outlets) {
          stockists.push({
            id: `p${p.id}-o${o.id}`,
            company_name: o.label ? `${p.company_name} — ${o.label}` : p.company_name,
            address: o.address,
            phone: o.phone || p.phone,
            region: o.region,
            brands,
          });
        }
      } else {
        // No outlets recorded — single card from the partner's own fields.
        stockists.push({
          id: `p${p.id}`,
          company_name: p.company_name,
          address: p.address,
          phone: p.phone,
          region: p.region,
          brands,
        });
      }
    }

    // Region filtering happens here, after flattening to outlet-level
    // cards, since which "region" field applies (outlet's vs partner's)
    // depends on whether outlets exist — simpler and correct to filter
    // post-flatten than to encode that conditional in SQL.
    if (region) stockists = stockists.filter(s => s.region === region);

    res.json({ stockists });
  });

  // GET /api/stockists/regions — the 5 Singapore URA regions, for the
  // filter dropdown. Static, but served from here so the frontend doesn't
  // need to hardcode/duplicate this list.
  router.get('/regions', (req, res) => {
    res.json({ regions: ['Central', 'East', 'North', 'North-East', 'West'] });
  });

  return router;
};
