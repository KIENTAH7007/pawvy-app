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
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    )`,
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
    // Order Portal (Phase 6) — public submissions awaiting internal review/approval
    `CREATE TABLE IF NOT EXISTS portal_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      partner_id INTEGER REFERENCES partners(id),
      created_sale_ids TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS portal_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portal_order_id INTEGER NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    // Shipments (Phase 7) — supplier orders, landed cost, cost variance tracking.
    // Skeleton only for this patch: tables exist but no read/write logic uses them yet.
    `CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_code TEXT UNIQUE NOT NULL,
      brand_id INTEGER REFERENCES brands(id),
      supplier_name TEXT,
      currency TEXT NOT NULL DEFAULT 'SGD',
      order_date DATE,
      arrival_date DATE,
      costed_date DATE,
      status TEXT NOT NULL DEFAULT 'ordered',
      received_warehouse TEXT DEFAULT 'Storhub',
      fx_rate_actual REAL,
      fx_processing_charge REAL DEFAULT 0,
      cashback REAL DEFAULT 0,
      forwarder_invoice_value REAL DEFAULT 0,
      permit_invoice_value REAL DEFAULT 0,
      avs_payment REAL DEFAULT 0,
      gst_amount REAL DEFAULT 0,
      freight_apportion_method TEXT DEFAULT 'value',
      total_landed_cost REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS shipment_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty_ordered INTEGER DEFAULT 0,
      qty_received INTEGER DEFAULT 0,
      unit_cost_original_currency REAL DEFAULT 0,
      weight_per_unit REAL,
      landed_cost_per_unit REAL,
      inventory_synced INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS shipment_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      file_path TEXT,
      file_name TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS sku_cost_reference (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      effective_date DATE NOT NULL,
      cost_original_currency REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      weight_per_unit REAL,
      source_shipment_id INTEGER REFERENCES shipments(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS cost_variance_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      landed_cost REAL NOT NULL,
      set_cost_price REAL NOT NULL,
      variance_amount REAL NOT NULL,
      variance_pct REAL NOT NULL,
      flag TEXT NOT NULL,
      logged_date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    // Restock Checklist — staged Storhub <-> Home transfer prep, so a
    // physical warehouse run can be checked off item-by-item and then
    // committed as real inventory transfers in one action.
    `CREATE TABLE IF NOT EXISTS restock_checklists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT,
      direction TEXT NOT NULL DEFAULT 'storhub_to_home',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS restock_checklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checklist_id INTEGER NOT NULL REFERENCES restock_checklists(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty_planned INTEGER NOT NULL DEFAULT 0,
      qty_taken INTEGER,
      checked INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  tables.forEach(sql => db.run(sql));

  // Product images for Order Portal catalogue
  try { db.run("ALTER TABLE products ADD COLUMN image_data TEXT"); } catch(e) {}

  // Shipment document files (base64 stored in DB, same pattern as product images)
  try { db.run("ALTER TABLE shipment_documents ADD COLUMN file_data TEXT"); } catch(e) {}

  // GST manual-override flag — when set, /cost uses the stored gst_amount
  // as-is instead of recalculating it (still editable, still auto by default)
  try { db.run("ALTER TABLE shipments ADD COLUMN gst_amount_override INTEGER DEFAULT 0"); } catch(e) {}

  // Variance ledger: total dollar impact (per-unit diff × qty received), not
  // just the per-unit rate — this is the number that actually feeds P&L
  try { db.run("ALTER TABLE cost_variance_ledger ADD COLUMN variance_total REAL DEFAULT 0"); } catch(e) {}

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

  // Order Portal (Phase 6): manual display ordering within a brand.
  // NULL = falls back to alphabetical item_series/variation ordering.
  try { db.run("ALTER TABLE products ADD COLUMN portal_sort_order INTEGER"); } catch(e) {}

  // Order Portal (Phase 6): void an approved/rejected order record.
  // Purely a bookkeeping marker on the order itself — never touches the
  // sales table. Voiding an already-approved order does NOT reverse the
  // sale it created; that's done manually in the Sales Ledger by design.
  try { db.run("ALTER TABLE portal_orders ADD COLUMN voided_at DATETIME"); } catch(e) {}

  // Per-partner credit term (days until an invoice/SOA is considered overdue).
  // Defaults to 7 to match existing behavior for every partner that predates
  // this field; editable per partner in Partners tab going forward.
  try { db.run("ALTER TABLE partners ADD COLUMN credit_term_days INTEGER DEFAULT 7"); } catch(e) {}
  try { db.run("UPDATE partners SET credit_term_days = 7 WHERE credit_term_days IS NULL"); } catch(e) {}

  // Upselling (Order Portal): tags each cart line by how it was added, so
  // Dashboard can compare catalogue-driven vs upsell-driven orders. Existing
  // rows default to 'catalogue' since upselling didn't exist before this.
  try { db.run("ALTER TABLE portal_order_items ADD COLUMN source TEXT DEFAULT 'catalogue'"); } catch(e) {}
  try { db.run("UPDATE portal_order_items SET source = 'catalogue' WHERE source IS NULL"); } catch(e) {}

  // POS System: optional mailing details captured at checkout when an item
  // needs to be mailed rather than collected in person. Denormalized onto
  // every sales row from that checkout (simple — no separate orders table
  // needed since POS sales go straight to Sales Ledger, no approval step).
  try { db.run("ALTER TABLE sales ADD COLUMN mailing_name TEXT"); } catch(e) {}
  try { db.run("ALTER TABLE sales ADD COLUMN mailing_address TEXT"); } catch(e) {}
  try { db.run("ALTER TABLE sales ADD COLUMN mailing_phone TEXT"); } catch(e) {}

  console.log('✅ Schema ready');
}

module.exports = { init, getDb: () => ({ query, queryOne, run }), backupNow: () => persistToDisk(), getDbPath: () => DB_PATH };
