/**
 * Pawvy Data Migration - v2
 * Fixes: unit cost column, partner import, profit accuracy, no platform fee on history
 * Usage: node migrate.js <path-to-excel>
 */
const XLSX = require('xlsx');
const path = require('path');
const { init } = require('./server/database');

const EXCEL_PATH = process.argv[2] || '/mnt/user-data/uploads/Tracking_File_2026.xlsm';

const BRAND_MAP = {
  'better bone':'Better Bone','betterbone':'Better Bone','bb':'Better Bone',
  'gigwi':'GiGwi','gi gwi':'GiGwi',
  'lillidale':'Lillidale',
  'salmoil':'Salmoil',
  'puzzle feeder':'Puzzle Feeder','puzzlefeeder':'Puzzle Feeder',
  'east sea brother':'East Sea Brother','eastsea':'East Sea Brother','esb':'East Sea Brother',
};
const VALID_BRANDS = new Set(['Better Bone','GiGwi','Lillidale','Salmoil','Puzzle Feeder','East Sea Brother']);

const MONTH_NUM = { january:1,february:2,march:3,april:4,may:5,june:6,
  july:7,august:8,september:9,october:10,november:11,december:12 };

function normBrand(raw) {
  if (!raw) return null;
  const key = String(raw).toLowerCase().trim();
  return BRAND_MAP[key] || (VALID_BRANDS.has(raw.trim()) ? raw.trim() : null);
}

function buildDate(day, monthName, year=2026) {
  if (!day || !monthName) return null;
  const m = MONTH_NUM[String(monthName).toLowerCase().trim()];
  if (!m) return null;
  const d = parseInt(day);
  if (isNaN(d) || d < 1 || d > 31) return null;
  return `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function cleanNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : Math.round(n * 10000) / 10000;
}

const CHAN_MAP = {
  shopee:'Shopee', lazada:'Lazada', kohepets:'Kohepets', amazon:'Amazon',
  tiktok:'TikTok Shop', event:'Event Sale', offline:'Walk-in / Direct',
  'walk-in':'Walk-in / Direct', direct:'Walk-in / Direct',
  wholesale:'Wholesale Order', consignment:'Consignment Replenishment',
  normal:'Wholesale Order', pickup:'Pickup / Collected',
  commission:'Commission Sale', 'e-commerce':'Online',
};
function normChannel(raw) {
  if (!raw) return 'Other';
  const key = String(raw).toLowerCase().trim();
  for (const [k,v] of Object.entries(CHAN_MAP)) { if (key.includes(k)) return v; }
  return String(raw).trim();
}

async function migrate() {
  console.log('\n🐾  Pawvy Migration v2');
  console.log('   Reading:', EXCEL_PATH, '\n');

  const wb = XLSX.readFile(EXCEL_PATH, { raw: true });
  const db = await init();

  /* ── Wipe and reseed ─────────────────────────────────────────── */
  console.log('🗑️   Clearing existing data…');
  db.run('DELETE FROM sales');
  db.run('DELETE FROM products');
  db.run('DELETE FROM partner_brands');
  db.run('DELETE FROM partners');
  db.run('DELETE FROM brands');
  db.run("DELETE FROM sqlite_sequence WHERE name IN ('sales','products','partners','brands')");

  /* ── Brands ──────────────────────────────────────────────────── */
  const BRAND_COLORS = {
    'Better Bone':'#f36f4a','GiGwi':'#378ADD','Lillidale':'#639922',
    'Salmoil':'#BA7517','Puzzle Feeder':'#7F77DD','East Sea Brother':'#1D9E75',
  };
  const brandIdMap = {};
  for (const [name, color] of Object.entries(BRAND_COLORS)) {
    const r = db.run('INSERT INTO brands (name,color) VALUES (?,?)', [name, color]);
    brandIdMap[name.toLowerCase()] = r.lastID;
  }
  console.log('✅  Brands seeded:', Object.keys(BRAND_COLORS).join(', '));

  /* ── Products from Price_List ────────────────────────────────── */
  console.log('\n📦  Migrating Price_List → products…');
  const plRows = XLSX.utils.sheet_to_json(wb.Sheets['Price_List'], { defval:null, raw:true });
  const productRows = plRows.filter(r => r['Brand'] && r['Item Series'] && r['Unit Price'] != null);

  let prodImported = 0;
  const allProducts = []; // cache for sales lookup
  for (const row of productRows) {
    const brandName = normBrand(row['Brand']);
    if (!brandName) continue;
    const brand_id = brandIdMap[brandName.toLowerCase()];
    if (!brand_id) continue;

    const barcode    = row['Barcode'] ? String(Math.round(row['Barcode'])) : null;
    const series     = String(row['Item Series']).trim();
    const variation  = row['Variation'] ? String(row['Variation']).trim() : null;
    const unit_cost  = cleanNum(row['Unit Price']); // ← FIXED: was 'Capital'/'Cost'
    const wholesale  = cleanNum(row['Wholesale']);
    const consign    = cleanNum(row['Consignment']);
    const rrp        = cleanNum(row['RRP']);

    try {
      const r = db.run(`
        INSERT OR IGNORE INTO products
          (brand_id,barcode,item_series,variation,unit_cost,
           price_wholesale_sg,price_consignment_sg,price_rrp_sg)
        VALUES (?,?,?,?,?,?,?,?)
      `, [brand_id, barcode, series, variation, unit_cost, wholesale, consign, rrp]);
      const prod = db.queryOne('SELECT id FROM products WHERE brand_id=? AND item_series=? AND COALESCE(variation,"")=COALESCE(?,"") LIMIT 1', [brand_id, series, variation]);
      if (prod) allProducts.push({ id:prod.id, barcode, item_series:series, variation, brand_id, unit_cost });
      prodImported++;
    } catch(e) {}
  }
  console.log(`  ✅  ${prodImported} products imported`);

  /* ── Partners from All Partners Info ────────────────────────── */
  console.log('\n👥  Migrating All Partners Info → partners…');
  const partnerRows = XLSX.utils.sheet_to_json(wb.Sheets['All Partners Info'], { defval:null, raw:true });
  const realPartners = partnerRows.filter(r => r['Company Name'] && String(r['Company Name']).trim() !== '');

  const MODEL_NORM = { 'inventory':'Inventory','consignment':'Consignment','commission':'Commission','none':'None','pickup':'Pickup' };
  function normModel(raw) {
    if (!raw) return 'Inventory';
    const k = String(raw).toLowerCase().split('/')[0].trim();
    return MODEL_NORM[k] || 'Inventory';
  }
  function normType(raw) {
    if (!raw) return 'Other';
    const r = String(raw).toLowerCase();
    if (r.includes('groom'))    return 'Grooming Salon';
    if (r.includes('train'))    return 'Trainer';
    if (r.includes('vet'))      return 'Vet Clinic';
    if (r.includes('e-comm') || r.includes('online') || r.includes('ecomm')) return 'Online';
    if (r.includes('retail') || r.includes('puppy')) return 'Retail Shop';
    if (r.includes('event'))    return 'Other';
    return 'Other';
  }

  let partImported = 0;
  for (const row of realPartners) {
    const name  = String(row['Company Name']).trim();
    const pic   = row['Person In Charge'] ? String(row['Person In Charge']).trim() : null;
    const type  = normType(row['Business Type']);
    const model = normModel(row['Model with Pawvy']);
    const addr  = row['Address'] ? String(row['Address']).trim() : null;
    const notes = row['Remarks'] ? String(row['Remarks']).trim() : null;
    const brands= row['Pawvy Brands'] ? String(row['Pawvy Brands']).trim() : null;
    try {
      db.run('INSERT OR IGNORE INTO partners (company_name,pic_name,business_type,model,market,address,notes) VALUES (?,?,?,?,?,?,?)',
        [name, pic, type, model, 'SG', addr, [notes, brands ? `Brands: ${brands}` : null].filter(Boolean).join(' | ') || null]);
      partImported++;
    } catch(e) {}
  }
  console.log(`  ✅  ${partImported} partners imported`);

  /* ── Sales from Raw_(SG) ─────────────────────────────────────── */
  console.log('\n💰  Migrating Raw_(SG) → sales…');
  const rawRows  = XLSX.utils.sheet_to_json(wb.Sheets['Raw_(SG)'], { defval:null, raw:true });
  const saleRows = rawRows.filter(r => r['Qty'] > 0 && r['Sale Price'] > 0);

  function findProduct(barcode, series, variation, brandId) {
    if (barcode) {
      const bc = String(barcode).replace(/\.0$/, '');
      const p  = allProducts.find(p => p.barcode === bc);
      if (p) return p;
    }
    return allProducts.find(p =>
      p.brand_id === brandId &&
      p.item_series?.toLowerCase().trim() === String(series||'').toLowerCase().trim() &&
      (p.variation||'').toLowerCase().trim() === String(variation||'').toLowerCase().trim()
    ) || null;
  }

  /* ── Build platform → partner_id lookup ─────────────────────── */
  const allPartners = db.query('SELECT id, company_name FROM partners');
  const platformToPartnerId = {};

  // Strict name matching — only match if platform IS contained in partner name (not the other way)
  // or partner name IS contained in platform (for full name matches)
  function findPartnerId(platformStr) {
    if (!platformStr) return null;
    const pLow = platformStr.toLowerCase().trim();
    // Skip generic channel names
    const skipChannels = ['event sale','shopee','lazada','amazon','tiktok','offline','direct','walk-in','pickup','wholesale','normal','b2b'];
    if (skipChannels.some(s => pLow.includes(s))) return null;
    // Exact match
    let match = allPartners.find(p => p.company_name.toLowerCase() === pLow);
    if (match) return match.id;
    // Partner name fully contained in platform string (e.g. "Vanillapup" in "Vanillapup Cluny")
    // min 8 chars to prevent short word false matches
    match = allPartners.find(p => {
      const cLow = p.company_name.toLowerCase();
      return cLow.length >= 8 && pLow.includes(cLow);
    });
    if (match) return match.id;
    // Platform string fully contained in partner name (e.g. "Pawpy Kisses" in partner full name)
    if (pLow.length >= 8) {
      match = allPartners.find(p => p.company_name.toLowerCase().includes(pLow));
      if (match) return match.id;
    }
    return match ? match.id : null;
  }

  // Known mappings for platform values that don't directly match partner names
  const PLATFORM_PARTNER_MAP = {
    'olo katong':              'our little ones (olo) katong',
    'olo lavender':            'our little ones (olo) lavender',
    'olo pasir panjang':       'our little ones (olo) pasir panjang',
    'urban paws je':           'urban paws jurong east',
    'urban paws tk':           'urban paws telok kurau',
    'chained dog awareness':   'the blue boy agency',
    'vanillapup cluny':        'vanillapup',
    'vanillapup serangoon':    'vanillapup',
    'noble canine oasis':      null,
    'polypet':                 null,
    'doggie delight':          null,
    'woof living':             null,
    'fur':                     null,
    'pop pop pets':            null,
    'woof loof':               null,
    'the beaded space':        null,
    'lucky petscare':          null,
    'offline':                 null,
    'event sale':              null,
  };

  let saleImported = 0, saleSkipped = 0;
  for (const row of saleRows) {
    const dateStr  = buildDate(row['Date'], row['Month'], 2026);
    const brandId  = (() => { const n = normBrand(row['Brand']); return n ? brandIdMap[n.toLowerCase()] : null; })();
    const series   = row['Item Series'] ? String(row['Item Series']).trim() : null;
    const barcode  = row['Barcode'] ? String(Math.round(row['Barcode'])) : null;
    const variation= row['Variation'] ? String(row['Variation']).trim() : null;
    const qty      = parseInt(row['Qty']);
    // In Raw_(SG), Sale Price and Capital are TOTAL values (not per-unit).
    // Divide by qty to get per-unit values so profit = qty*(price-cost) is correct.
    const totalSale = cleanNum(row['Sale Price']);
    const totalCap  = cleanNum(row['Capital']);
    const unitPrice = qty > 0 ? parseFloat((totalSale / qty).toFixed(4)) : totalSale;
    const unitCost  = qty > 0 ? parseFloat((totalCap  / qty).toFixed(4)) : totalCap;
    const channel  = normChannel(row['Platform']);

    if (!dateStr || !brandId || !series || qty <= 0 || unitPrice <= 0) { saleSkipped++; continue; }

    const prod = findProduct(barcode, series, variation, brandId);
    if (!prod) { saleSkipped++; continue; }

    // Resolve partner_id from platform string
    const pLow = (row['Platform']||'').toLowerCase().trim();
    let pid = null;
    if (pLow in PLATFORM_PARTNER_MAP) {
      const mapped = PLATFORM_PARTNER_MAP[pLow];
      if (mapped) pid = allPartners.find(p => p.company_name.toLowerCase().includes(mapped))?.id || null;
    } else {
      pid = findPartnerId(row['Platform']);
    }

    try {
      db.run('INSERT INTO sales (date,product_id,partner_id,channel,market,qty,unit_cost,unit_price,platform_fee_pct,platform_fee_amt) VALUES (?,?,?,?,?,?,?,?,0,0)',
        [dateStr, prod.id, pid||null, channel, 'SG', qty, unitCost, unitPrice]);
      saleImported++;
    } catch(e) { saleSkipped++; }
  }
  console.log(`  ✅  ${saleImported} sales imported, ${saleSkipped} skipped`);

  /* ── Summary ─────────────────────────────────────────────────── */
  const t = {
    brands:   db.queryOne('SELECT COUNT(*) AS n FROM brands').n,
    products: db.queryOne('SELECT COUNT(*) AS n FROM products').n,
    partners: db.queryOne('SELECT COUNT(*) AS n FROM partners').n,
    sales:    db.queryOne('SELECT COUNT(*) AS n FROM sales').n,
  };
  const profit = db.queryOne('SELECT ROUND(SUM(qty*(unit_price-unit_cost)),2) AS p FROM sales').p;
  console.log(`\n🎉  Migration complete!`);
  console.log(`   Brands: ${t.brands} | Products: ${t.products} | Partners: ${t.partners} | Sales: ${t.sales}`);
  console.log(`   Total gross profit in DB: SGD ${profit}`);
  process.exit(0);
}

migrate().catch(e => { console.error('Migration failed:', e); process.exit(1); });
