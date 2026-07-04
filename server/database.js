const initSqlJs = require('sql.js');
const fs        = require('fs');
const path      = require('path');

// ── Path resolution ───────────────────────────────────────────────
// Local dev:  data/pawvy.db  (relative to project root)
// Railway:    /data/pawvy.db (persistent volume, set via DATABASE_PATH env var)
const IS_PROD   = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
const PROD_PATH = process.env.DATABASE_PATH || '/data/pawvy.db';
const DEV_PATH  = path.join(__dirname, '..', 'data', 'pawvy.db');
const SEED_PATH = path.join(__dirname, '..', 'data', 'seed.db');
const DB_PATH   = IS_PROD ? PROD_PATH : DEV_PATH;

// Save interval (ms) — batch writes to avoid excessive disk I/O
const SAVE_INTERVAL_MS = 5000;
let db         = null;
let saveTimer  = null;
let isDirty    = false;

function scheduleSave() {
  isDirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (isDirty) persistToDisk();
  }, SAVE_INTERVAL_MS);
}

function persistToDisk() {
  if (!db) return;
  try {
    const data = db.export();
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    isDirty = false;
  } catch (e) {
    console.error('⚠️  DB save failed:', e.message);
  }
}

// Graceful shutdown — flush to disk before exit
process.on('SIGTERM', () => { persistToDisk(); process.exit(0); });
process.on('SIGINT',  () => { persistToDisk(); process.exit(0); });

// ── sql.js wrapper ────────────────────────────────────────────────
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  return query(sql, params)[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  const lastID = db.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0];
  scheduleSave();
  return { lastID, changes: db.getRowsModified() };
}

function runNoSave(sql, params = []) {
  db.run(sql, params);
}

// ── Initialise ────────────────────────────────────────────────────
async function init() {
  const SQL = await initSqlJs();

  // Decide which database file to load
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    console.log(`✅ Loaded database: ${DB_PATH}`);
  } else if (IS_PROD && fs.existsSync(SEED_PATH)) {
    // First deploy on Railway — copy seed database to persistent volume
    fs.mkdirSync(path.dirname(PROD_PATH), { recursive: true });
    fs.copyFileSync(SEED_PATH, PROD_PATH);
    db = new SQL.Database(fs.readFileSync(PROD_PATH));
    console.log(`✅ First deploy: copied seed DB to ${PROD_PATH}`);
  } else {
    // Brand new database
    db = new SQL.Database();
    console.log(`✅ Created new database at ${DB_PATH}`);
  }

  createSchema();
  persistToDisk(); // ensure the file exists on disk
  return { query, queryOne, run };
}

// ── Schema (idempotent — safe to run on existing DB) ─────────────
function createSchema() {
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA foreign_keys = ON;');

  const tables = [
    `CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#888888',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id INTEGER NOT NULL REFERENCES brands(id),
      barcode TEXT UNIQUE,
      item_series TEXT NOT NULL,
      variation TEXT,
      unit_cost REAL DEFAULT 0,
      price_wholesale_sg REAL DEFAULT 0,
      price_consignment_sg REAL DEFAULT 0,
      price_rrp_sg REAL DEFAULT 0,
      price_wholesale_my REAL DEFAULT 0,
      price_rrp_my REAL DEFAULT 0,
      price_wholesale_au REAL DEFAULT 0,
      price_rrp_au REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      pic_name TEXT,
      business_type TEXT,
      model TEXT,
      market TEXT DEFAULT 'SG',
      address TEXT,
      phone TEXT,
      email TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS partner_brands (
      partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      PRIMARY KEY (partner_id, brand_id)
    )`,
    `CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id),
      partner_id INTEGER REFERENCES partners(id),
      channel TEXT NOT NULL,
      market TEXT DEFAULT 'SG',
      qty INTEGER NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      platform_fee_pct REAL DEFAULT 0,
      platform_fee_amt REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      location TEXT NOT NULL,
      partner_id INTEGER REFERENCES partners(id),
      qty INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS consignment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_id INTEGER NOT NULL REFERENCES partners(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty_placed INTEGER NOT NULL DEFAULT 0,
      qty_sold INTEGER NOT NULL DEFAULT 0,
      qty_returned INTEGER NOT NULL DEFAULT 0,
      date_placed DATE,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS consignment_placements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_id INTEGER NOT NULL REFERENCES partners(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      date DATE NOT NULL,
      qty INTEGER NOT NULL,
      unit_cost REAL DEFAULT 0,
      consignment_price REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS consignment_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_id INTEGER NOT NULL REFERENCES partners(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      date DATE NOT NULL,
      qty INTEGER NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS consignment_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_id INTEGER NOT NULL REFERENCES partners(id),
      date DATE NOT NULL,
      notes TEXT,
      invoiced INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS consignment_count_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      count_id INTEGER NOT NULL REFERENCES consignment_counts(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty_on_hand INTEGER NOT NULL DEFAULT 0,
      qty_counted INTEGER NOT NULL DEFAULT 0,
      qty_discrepancy INTEGER NOT NULL DEFAULT 0,
      consignment_price REAL DEFAULT 0,
      unit_cost REAL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS consignment_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_id INTEGER NOT NULL REFERENCES partners(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      snapshot_date DATE NOT NULL,
      period_label TEXT,
      on_hand_qty INTEGER NOT NULL DEFAULT 0,
      consignment_price REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS partner_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      address TEXT NOT NULL,
      pic_name TEXT,
      phone TEXT,
      is_primary INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      type TEXT DEFAULT 'Invoice',
      partner_id INTEGER REFERENCES partners(id),
      date DATE NOT NULL,
      due_date DATE,
      market TEXT DEFAULT 'SG',
      currency TEXT DEFAULT 'SGD',
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      status TEXT DEFAULT 'Draft',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      description TEXT,
      qty INTEGER DEFAULT 1,
      unit_price REAL DEFAULT 0,
      line_total REAL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS operating_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      market TEXT DEFAULT 'SG',
      receipt_ref TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id),
      location TEXT NOT NULL,
      type TEXT NOT NULL,
      qty_change INTEGER NOT NULL,
      reference TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      location TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_id, location)
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id),
      type TEXT NOT NULL,
      qty_change INTEGER NOT NULL,
      reason TEXT,
      cost_impact REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  tables.forEach(sql => db.run(sql));

  // Product images for Order Portal catalogue
  try { db.run("ALTER TABLE products ADD COLUMN image_data TEXT"); } catch(e) {}

  // Partner outlet address on invoice/DO
  try { db.run("ALTER TABLE invoices ADD COLUMN outlet_address_id INTEGER REFERENCES partner_addresses(id)"); } catch(e) {}

  // Partner tier (VIP / Active / Non-active) — safe to run multiple times
  try { db.run("ALTER TABLE partners ADD COLUMN tier TEXT DEFAULT 'Active'"); } catch(e) {}
  db.run("UPDATE partners SET tier = 'Active' WHERE tier IS NULL");

  // Phase 4: Inventory write-off location tracking
  try { db.run("ALTER TABLE inventory_adjustments ADD COLUMN location TEXT DEFAULT 'Home'"); } catch(e) {}

  // Phase 3: Invoice / Delivery Order / SOA support columns
  [
    "ALTER TABLE invoices ADD COLUMN paid_date DATE",
    "ALTER TABLE invoices ADD COLUMN shipping REAL DEFAULT 0",
    "ALTER TABLE invoices ADD COLUMN period_start DATE",
    "ALTER TABLE invoices ADD COLUMN period_end DATE",
    "ALTER TABLE invoices ADD COLUMN included_in_soa_id INTEGER REFERENCES invoices(id)",
    "ALTER TABLE sales ADD COLUMN invoice_id INTEGER REFERENCES invoices(id)",
    "ALTER TABLE sales ADD COLUMN do_id INTEGER REFERENCES invoices(id)",
    "ALTER TABLE partners ADD COLUMN billing_cycle TEXT DEFAULT 'per_invoice'",
  ].forEach(sql => { try { db.run(sql); } catch(e) {} });

  // Add discount columns to partners (safe ALTER TABLE — ignored if already exist)
  [
    "ALTER TABLE partners ADD COLUMN discount_type TEXT DEFAULT 'standard_rebate'",
    "ALTER TABLE partners ADD COLUMN discount_value REAL DEFAULT 0",
    "ALTER TABLE partners ADD COLUMN discount_threshold REAL DEFAULT 0",
  ].forEach(sql => { try { db.run(sql); } catch(e) {} });

  // Add sale-level columns (safe ALTER TABLE — ignored if already exist)
  [
    "ALTER TABLE sales ADD COLUMN voided INTEGER DEFAULT 0",
    "ALTER TABLE sales ADD COLUMN shipping_charged REAL DEFAULT 0",
    "ALTER TABLE sales ADD COLUMN shipping_cost REAL DEFAULT 0",
  ].forEach(sql => { try { db.run(sql); } catch(e) {} });

  // Backfill NULL discount_type for existing rows (Railway seed data has NULLs)
  try {
    db.run("UPDATE partners SET discount_type = 'standard_rebate' WHERE discount_type IS NULL");
    db.run("UPDATE partners SET discount_value = 0 WHERE discount_value IS NULL");
    db.run("UPDATE partners SET discount_threshold = 0 WHERE discount_threshold IS NULL");
    // One-time backfill only — billing_cycle starts NULL before the ALTER's DEFAULT applies to existing rows.
    // Vanillapup's credit_note model is inherently SOA-based, so default it that way; everyone else gets per_invoice.
    db.run("UPDATE partners SET billing_cycle = CASE WHEN discount_type = 'credit_note' THEN 'soa' ELSE 'per_invoice' END WHERE billing_cycle IS NULL");
  } catch(e) {}

  console.log('✅ Schema ready');
}

module.exports = { init, getDb: () => ({ query, queryOne, run }) };
