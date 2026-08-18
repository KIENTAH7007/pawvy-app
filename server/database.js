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

    // ── Foundation phase: customer database + BUTTONS rewards ────────
    // See pawvy-buttons-spec.md for the full agreed rules this schema
    // implements. Backend is the single source of truth — the future
    // pawvy.co website calls these via API, it never maintains its own
    // separate customer store.

    // One row per pawrent account. Created either by POS (unverified
    // until the magic-link is clicked) or self-signup on the website
    // (verified immediately). email is the login identity going forward.
    `CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      address TEXT,
      phone TEXT,
      email TEXT UNIQUE,
      account_status TEXT NOT NULL DEFAULT 'unverified',
      signup_source TEXT,
      referred_by_customer_id INTEGER REFERENCES customers(id),
      referral_code TEXT UNIQUE,
      instagram_handle TEXT,
      preferred_contact_channel TEXT,
      profile_bonus_claimed INTEGER NOT NULL DEFAULT 0,
      pdpa_consent INTEGER NOT NULL DEFAULT 0,
      pdpa_consent_text TEXT,
      pdpa_consent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Second-layer profile data. Separate table (not columns on customers)
    // so a pawrent can register more than one pet later without a schema
    // change — even though the current UI/bonus logic assumes one pet.
    `CREATE TABLE IF NOT EXISTS customer_pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      name TEXT,
      breed TEXT,
      weight REAL,
      birthday DATE,
      allergies TEXT,
      favorite_item TEXT,
      chew_power TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Magic-link auth. One row per link issued; used_at marks it consumed
    // so a link can't be replayed after the customer has already clicked it.
    `CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL DEFAULT 'login',
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Admin-editable earn-rate multiplier windows (e.g. "Button's Birthday
    // Week", 2x). No code changes needed to run a campaign — just a row here.
    `CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      multiplier REAL NOT NULL DEFAULT 1,
      scope TEXT NOT NULL DEFAULT 'site_wide',
      scope_value TEXT,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Admin-editable free-text messages for the website's homepage marquee
    // ticker — campaigns, event/booth announcements, or anything else KT
    // wants scrolling across the site, updatable from the Pawvy App with
    // no website code changes needed. `sort_order` controls display order
    // (lower first); ties broken by id. Only is_active=1 rows are ever
    // returned to the public website endpoint.
    `CREATE TABLE IF NOT EXISTS ticker_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Hand-picked images for the website's homepage Instagram section.
    // Previously rendered via Instagram's own official embed script
    // (instagram.com/embed.js) — replaced because it showed the full post
    // card (caption, like count, Instagram's own UI) rather than a clean
    // photo grid. Now KT uploads the actual image (image_data, base64 —
    // added via ALTER TABLE below, same pattern as products.image_data)
    // plus an optional destination link (link_url — a specific post or
    // just the Pawvy profile). `sort_order` controls left-to-right order.
    `CREATE TABLE IF NOT EXISTS instagram_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // The reusable "full-width takeover" homepage banner, for announcing a
    // new brand (Wild Balance being the first case this was built for) —
    // see the Nov 2026 homepage-hero discussion. KT uploads an image and a
    // short headline, sets a link (where clicking the banner goes — falls
    // back to the brand gallery if left blank, so it's never a dead click),
    // and a start/end date window, same is_active + date-window pattern
    // already used for campaigns and the New badge. Kept as a small history
    // table (like instagram_posts/ticker_messages) rather than a single
    // settings row, purely so past launches stay on record for reference —
    // only ever one is expected to be genuinely active (is_active=1 AND
    // within its date window) at a time, though the public endpoint picks
    // the most recent if more than one somehow qualifies at once.
    `CREATE TABLE IF NOT EXISTS homepage_banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_data TEXT,
      headline TEXT,
      link_url TEXT,
      start_date DATE,
      end_date DATE,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // BUTTONS ledger — one row per batch earned. Tracked as discrete batches
    // (not a single running balance) so expiry can be FIFO per-batch, and so
    // the 7-day hold can be enforced per-batch via `status`. remaining is
    // decremented as this batch gets drawn down by redemptions (see
    // buttons_batch_redemptions). expires_at is only set once credited —
    // it's 1 year from credited_at, not from earned_at.
    `CREATE TABLE IF NOT EXISTS buttons_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      remaining INTEGER NOT NULL,
      source TEXT NOT NULL,
      source_type TEXT,
      source_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      credited_at DATETIME,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // One row per redemption event (a website checkout that used B).
    `CREATE TABLE IF NOT EXISTS buttons_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // FIFO audit trail: how much of each specific batch was drawn down for
    // a given redemption. Lets us prove/replay exactly which B was spent
    // where, rather than just trusting a single balance number.
    `CREATE TABLE IF NOT EXISTS buttons_batch_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      redemption_id INTEGER NOT NULL REFERENCES buttons_redemptions(id) ON DELETE CASCADE,
      batch_id INTEGER NOT NULL REFERENCES buttons_batches(id),
      amount INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Digital stamp card — raw events, not a running counter. Weekly cap
    // (7/week) and the every-5-stamps=100B bonus are both computed from
    // these rows at read time, not stored as a derived number — avoids the
    // exact class of counter-drift bug already hit once in this codebase
    // (Patch 92's sign-flip bug came from a display-layer shortcut).
    `CREATE TABLE IF NOT EXISTS stamp_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      approved_by TEXT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Website "Contact Us" enquiries — anonymous, no customer_id required
    // (someone doesn't need a Pawvy account to ask a question). replied is
    // a simple manual flag staff toggle once handled, since replies happen
    // over email/WhatsApp, not tracked in this app.
    `CREATE TABLE IF NOT EXISTS enquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      message TEXT NOT NULL,
      replied INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Website checkout (Patch 120) — real B2C orders from pawvy.co, paid via
    // Stripe (card + PayNow). Deliberately named website_orders/_items, NOT
    // "orders" — /api/orders + the `portal_orders` table already exist for
    // staff-reviewed B2B wholesale submissions, a completely different flow
    // (approval queue, no payment gateway). Reusing "orders" here would be
    // confusing at best. A row is created as soon as a Stripe Checkout
    // Session is started (status='pending_payment') and only flips to 'paid'
    // once the webhook confirms real payment — inventory deduction, the
    // `sales` ledger row, and BUTTONS earn/redeem all happen at that point,
    // never at session creation (see server/routes/checkout.js). This
    // mirrors the existing pattern of never reserving stock ahead of a
    // committed sale (same as portal_orders/pos.js).
    `CREATE TABLE IF NOT EXISTS website_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER REFERENCES customers(id),
      customer_email TEXT NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      shipping_address TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      shipping_amount REAL NOT NULL DEFAULT 0,
      buttons_redeemed INTEGER NOT NULL DEFAULT 0,
      buttons_redemption_value REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'sgd',
      status TEXT NOT NULL DEFAULT 'pending_payment',
      stripe_checkout_session_id TEXT UNIQUE,
      stripe_payment_intent_id TEXT,
      created_sale_ids TEXT,
      pdpa_consent INTEGER NOT NULL DEFAULT 0,
      pdpa_consent_text TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS website_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_order_id INTEGER NOT NULL REFERENCES website_orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Dedup log for the automated customer reminder emails (BUTTONS expiry
    // rollup + campaign/birthday multiplier nudge — see
    // server/jobs/customerReminders.js). One generic table rather than
    // separate per-email-type tables, since all three reminders need the
    // exact same question answered at send time ("have we already emailed
    // this customer about this recently?") and a single table keeps that
    // dedup logic in one place instead of three near-identical ones.
    // email_type: 'buttons_expiry' | 'birthday' | 'campaign'.
    // reference_id: NULL for buttons_expiry (it's a per-customer rollup,
    // not tied to one batch) and birthday (once-per-year, keyed off
    // customer + year, not a row elsewhere); the campaign's id for
    // 'campaign', so frequency dedup is scoped per-campaign — a customer
    // who qualifies for two simultaneous campaigns over their lifetime
    // (not at the same *moment*, since only the higher multiplier ever
    // wins — but across different date ranges) gets each tracked
    // independently.
    `CREATE TABLE IF NOT EXISTS automated_email_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      email_type TEXT NOT NULL,
      reference_id INTEGER,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  tables.forEach(sql => db.run(sql));

  // Product images for Order Portal catalogue
  try { db.run("ALTER TABLE products ADD COLUMN image_data TEXT"); } catch(e) {}

  // Instagram Highlights redesign — KT/Janice moved away from live-embedding
  // Instagram's own post cards (via embed.js) since they didn't match the
  // site's design at all (full post chrome, caption, like count — not a
  // clean photo grid). New approach: KT uploads the actual image himself
  // (same base64-in-DB pattern as product images above) plus an optional
  // destination link (a specific post, or just the Pawvy profile — see
  // routes/publicContent.js for the fallback logic). The old `url` column
  // is left in place rather than dropped (SQLite ALTER TABLE DROP COLUMN
  // is unreliable under sql.js) — it's just unused going forward. New
  // inserts pass url:'' to satisfy the original NOT NULL constraint
  // without exposing that historical detail to the admin UI.
  try { db.run("ALTER TABLE instagram_posts ADD COLUMN image_data TEXT"); } catch(e) {}
  try { db.run("ALTER TABLE instagram_posts ADD COLUMN link_url TEXT"); } catch(e) {}

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

  // POS System: optional shipping channel/courier (e.g. "SPX", "Ezyshipping"),
  // captured alongside mailing details. Different couriers carry different
  // shipping costs, so this is kept as free text for reference in the Sales
  // Ledger rather than a fixed list.
  try { db.run("ALTER TABLE sales ADD COLUMN shipping_channel TEXT"); } catch(e) {}

  // POS System: customer email + PDPA consent, captured at checkout as the
  // "first-layer" step of the customer database / BUTTONS rewards program.
  // Denormalized onto the sales row like the other POS-collected fields above.
  // pdpa_consent_text stores the EXACT wording shown to the customer at the
  // time of consent (not just a boolean) — needed as an audit trail in case
  // the wording changes later or consent is ever disputed.
  try { db.run("ALTER TABLE sales ADD COLUMN customer_email TEXT"); } catch(e) {}
  try { db.run("ALTER TABLE sales ADD COLUMN pdpa_consent INTEGER DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE sales ADD COLUMN pdpa_consent_text TEXT"); } catch(e) {}
  try { db.run("ALTER TABLE sales ADD COLUMN pdpa_consent_at TEXT"); } catch(e) {}

  // Product discount window — powers both campaign discounts and brand-
  // launch discounts on the website. The website always reads the current
  // effective price (base price minus this discount if active today) from
  // the backend API rather than storing its own copy of pricing.
  try { db.run("ALTER TABLE products ADD COLUMN discount_pct REAL DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE products ADD COLUMN discount_start DATE"); } catch(e) {}
  try { db.run("ALTER TABLE products ADD COLUMN discount_end DATE"); } catch(e) {}

  // Product description — for the website's product detail pages. Kept as
  // a plain text field on products (same table as everything else about a
  // product), not a separate table — one more field, not a new workflow.
  // Rarely edited compared to pricing/stock, so it lives in the existing
  // Edit Product modal rather than a new UI element.
  try { db.run("ALTER TABLE products ADD COLUMN description TEXT"); } catch(e) {}

  // Primary-pet flag — the birthday-month multiplier and the profile-
  // completion 50B bonus are both keyed off one designated pet, agreed as
  // simpler than requiring every registered pet to qualify. The current UI
  // only ever creates one pet per customer (so it's always primary by
  // default), but the flag exists now so multi-pet support later doesn't
  // need another schema change.
  try { db.run("ALTER TABLE customer_pets ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 1"); } catch(e) {}

  // Optional password, set by the customer themselves after their first
  // magic-link verification — NOT assigned by staff (that pattern was
  // rejected early on for security reasons; a customer-chosen password
  // after we've already verified their email is a different, standard
  // pattern). NULL means no password set yet — that account still falls
  // back to magic-link login only.
  try { db.run("ALTER TABLE customers ADD COLUMN password_hash TEXT"); } catch(e) {}

  // Partner region — powers the public Stockist page's region filter
  // (Central/East/North/North-East/West, Singapore's standard URA planning
  // regions). Deliberately NOT using a real geocoding/maps API for this —
  // per KT's cost concern, a simple region tag + brand filter gives the
  // same "find a stockist near me" utility for free, with a plain
  // (unpaid, keyless) link out to Google Maps per result for anyone who
  // wants the exact pin.
  try { db.run("ALTER TABLE partners ADD COLUMN region TEXT"); } catch(e) {}

  // Correction to the above: not every multi-outlet partner is split into
  // separate top-level partner rows — confirmed directly (e.g. Vanillapup
  // has two addresses crammed into one partner's address field, joined
  // with "/"). partner_addresses (the existing "outlets" sub-table) is
  // the real place multi-location partners are tracked when they ARE
  // split out. Region now lives here too — the public stockist endpoint
  // shows one card per outlet when outlets exist, falling back to the
  // partner's own address+region when they don't.
  try { db.run("ALTER TABLE partner_addresses ADD COLUMN region TEXT"); } catch(e) {}

  // Separate from is_active/tier: a partner can be a fully live, active
  // B2B relationship (e.g. VIP) without being a real public-facing
  // storefront — some are in-house/internal-use only and don't actually
  // take retail inventory. Defaults to 1 (shown) so this doesn't silently
  // hide any of the existing 107 partners the moment it deploys — staff
  // opt individual partners OUT, rather than the reverse.
  try { db.run("ALTER TABLE partners ADD COLUMN is_stockist INTEGER NOT NULL DEFAULT 1"); } catch(e) {}

  // Website checkout (Patch 121): the real Stripe processing fee (card
  // ~3.4%+$0.50, PayNow a different rate) for a Direct Online Sale row.
  // Deliberately separate from platform_fee_amt — that field already
  // carries BUTTONS-redemption-as-discount for these rows (see
  // checkout.js), and is revenue-reducing in reports.js's REVENUE_SQL.
  // stripe_fee_amt is a real operating cost, same treatment as
  // shipping_cost: it reduces PROFIT_SQL but never reduces top-line
  // revenue (revenue = what the customer actually paid). Defaults to 0,
  // so every pre-existing row/channel is completely unaffected.
  try { db.run("ALTER TABLE sales ADD COLUMN stripe_fee_amt REAL DEFAULT 0"); } catch(e) {}

  // Links a Direct Online Sale row back to the website_orders row it came
  // from. A single website order can produce multiple sales rows (one per
  // line item — see checkout.js's saleIds array), but BUTTONS are recorded
  // once per ORDER (recordPurchaseButtons keyed on sourceType:'website_order',
  // sourceId: order.id) — so voiding a sale needs this to find and void the
  // right BUTTONS batch. Nullable/unused for every other channel.
  try { db.run("ALTER TABLE sales ADD COLUMN website_order_id INTEGER REFERENCES website_orders(id)"); } catch(e) {}

  // Groups multiple `sales` rows (one per line item) into "this was all one
  // POS checkout" — POS never had this until now (unlike website orders,
  // which already had website_order_id), needed so a multi-item event
  // purchase earns/voids BUTTONS as one unit rather than fragmenting per
  // line. Set to the FIRST line's own `id` for every line in that checkout,
  // including itself — see server/routes/pos.js.
  try { db.run("ALTER TABLE sales ADD COLUMN pos_checkout_ref INTEGER"); } catch(e) {}

  // KT's per-occasion special discount (Pending Orders) — separate from the
  // partner's own standing rebate (platform_fee_amt), so both survive on the
  // record independently for audit trail. sales.unit_price continues to mean
  // exactly what it always has (the final per-unit price, post-special,
  // pre-rebate) — nothing about that changes. See client/src/pages/
  // PendingOrders.jsx for where this gets computed, and the "Subtotal" line
  // on generated invoices, which is reconstructed as
  // (net subtotal + special_discount) purely for display — see
  // generateInvoicePDF in client/src/pages/Invoices.jsx.
  try { db.run("ALTER TABLE sales ADD COLUMN special_discount_amt REAL DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE invoices ADD COLUMN special_discount REAL DEFAULT 0"); } catch(e) {}

  // Per-line special discount, mirroring sales.special_discount_amt — needed
  // so a generated invoice can show which SPECIFIC lines got KT's one-off
  // discount (not just the invoice-wide total added in the delivery before
  // this one). See generateInvoicePDF in client/src/pages/Invoices.jsx for
  // where this drives the optional "List Price" / "Discount" columns.
  try { db.run("ALTER TABLE invoice_items ADD COLUMN special_discount_amt REAL DEFAULT 0"); } catch(e) {}

  // Tracks when a pet's birthday was last actually changed (not just
  // saved — see server/routes/customers.js PUT /me/pet), so that field can
  // be rate-limited to once every 365 days. Without this, a customer could
  // repeatedly flip their pet's birthday to the current month to keep
  // re-triggering the 1.5x BUTTONS birthday-month bonus every time they
  // shop. NULL means never explicitly changed (still whatever was first
  // entered), which is never itself rate-limited — only a CHANGE away from
  // an already-set value starts the clock.
  try { db.run("ALTER TABLE customer_pets ADD COLUMN birthday_updated_at DATETIME"); } catch(e) {}

  // "New" badge (Products & Pricing → the renamed "Badge" button, same modal
  // as Discount) — mirrors the exact discount_pct/discount_start/discount_end
  // shape in server/lib/pricing.js, just simpler per KT's own design: a plain
  // on/off toggle (is_new) plus a single expiry date (new_until), no separate
  // start date needed since a product is "new" from whenever the toggle is
  // switched on. Read together with pricing.js's withEffectivePrice, which
  // now also computes is_new_active the same way it already computes
  // is_discount_active — see that file for the shared date-window logic.
  try { db.run("ALTER TABLE products ADD COLUMN is_new INTEGER DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE products ADD COLUMN new_until DATE"); } catch(e) {}

  // How often (in days) a live campaign should re-nudge a customer by
  // email while it's running — e.g. 1 for a one-weekend event like Pet
  // Expo (remind daily), 7 for a month-long storewide campaign (remind
  // weekly). NULL means "don't send reminder emails for this campaign at
  // all" (the safe default for existing rows, and for anyone who doesn't
  // set it) — see server/jobs/customerReminders.js, which only considers
  // campaigns where this is set and > 0.
  try { db.run("ALTER TABLE campaigns ADD COLUMN email_frequency_days INTEGER"); } catch(e) {}

  // ── Indexes (Aug 2026) ──────────────────────────────────────────
  // Purely additive — CREATE INDEX IF NOT EXISTS never changes existing
  // data or query results, only how fast SQLite can find matching rows.
  // Every filtered query the Sales Ledger, Dashboard, and Reports pages
  // actually run was a full table scan until now (grep confirmed zero
  // indexes existed anywhere in this schema). Added on the columns those
  // WHERE clauses actually filter by — see server/routes/reports.js and
  // server/routes/sales.js for the real queries these serve. No code
  // changes needed anywhere else; SQLite picks these up automatically.
  db.run('CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_sales_partner_id ON sales(partner_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_sales_product_id ON sales(product_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_invoices_partner_id ON invoices(partner_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON invoice_items(product_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_inventory_movements_date ON inventory_movements(date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON inventory_movements(product_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_website_orders_customer_id ON website_orders(customer_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_website_order_items_order_id ON website_order_items(website_order_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_portal_orders_partner_id ON portal_orders(partner_id)');

  // Bucket migration (Aug 2026): image_url holds the proxied bucket path
  // (e.g. "/api/uploads/products/123-1723200000000.jpg") once an image
  // has been moved out of the old base64 image_data column and into the
  // Railway Storage Bucket. NULL until migrated. image_data itself is
  // left untouched — this is additive, not destructive — so the
  // migration (server/jobs/imageMigration.js) can be re-run safely and
  // there's a fallback if anything ever needs to roll back.
  try { db.run("ALTER TABLE products ADD COLUMN image_url TEXT"); } catch(e) {}
  try { db.run("ALTER TABLE homepage_banners ADD COLUMN image_url TEXT"); } catch(e) {}
  try { db.run("ALTER TABLE instagram_posts ADD COLUMN image_url TEXT"); } catch(e) {}

  // "Active/Archived" toggle for customer accounts (Aug 2026) — for
  // accounts that are real signups (e.g. a friend helping pad the
  // customer count) but not real BUTTONS-earning pet owners. Defaults to
  // active for every existing row. Archived customers stay fully in the
  // `customers` table (never deleted — that's what the existing hard
  // "Delete" button on the Customers admin page is for, kept separate
  // and untouched by this) so any future customer-count reporting
  // naturally still includes them — this flag only ever controls (a)
  // default visibility in the admin Customers list (same "Show archived"
  // checkbox pattern already used on Products & Pricing) and (b) whether
  // the automated reminder emails (BUTTONS expiry / campaign / birthday
  // — see jobs/customerReminders.js) consider them at all.
  try { db.run("ALTER TABLE customers ADD COLUMN is_active INTEGER DEFAULT 1"); } catch(e) {}

  // Tracks whether stripe_fee_amt reflects a real value confirmed from
  // Stripe (1) or is still an unverified placeholder — either the $0
  // written at webhook time when the fee wasn't available yet, or a
  // manual guess KT typed into the Sales Ledger edit modal while
  // waiting. server/jobs/stripeFeeRefresh.js only ever touches rows
  // where this is 0 — once it successfully fetches the real fee, it
  // overwrites stripe_fee_amt with the authoritative value and sets
  // this to 1, so a correct manual guess just quietly stays the same
  // number, and an incorrect one gets corrected — either way, no
  // double-counting and no need for KT to remember to check back.
  try { db.run("ALTER TABLE sales ADD COLUMN stripe_fee_confirmed INTEGER DEFAULT 0"); } catch(e) {}

  // Homepage banner carousel (Aug 2026, per KT) — same sort_order
  // convention already used for instagram_posts: a plain integer staff
  // set directly, lower shows first. The first banner by this order is
  // the one whose headline gets rendered as the page's real <h1> (see
  // pawvy-website's HomepageBanner.jsx) — reordering banners in the
  // admin automatically moves which one that is, nothing else to update.
  try { db.run("ALTER TABLE homepage_banners ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"); } catch(e) {}

  // Per-banner caption visibility toggle (Aug 2026, per KT) — his
  // existing banner images already have designed-in text, so a second
  // overlay caption on top can look redundant/messy depending on the
  // specific image. Defaults to shown (1) so existing behavior doesn't
  // silently change for anyone who already had a banner set up. When
  // off, the headline text still exists in the real page HTML (still a
  // real H1 for the first banner, still real alt text on the image) —
  // this only controls whether it's ALSO rendered as a visible overlay
  // on screen. See pawvy-website's HomepageBanner.jsx for the actual
  // sr-only toggle.
  try { db.run("ALTER TABLE homepage_banners ADD COLUMN show_caption INTEGER NOT NULL DEFAULT 1"); } catch(e) {}

  // Per-device banner image (Aug 2026, per KT + Janice) — a 16:9 image
  // designed for desktop crops badly on a narrow phone; rather than
  // force one image to fit every shape via CSS cropping, staff can now
  // upload a second image specifically composed for mobile (e.g. 4:5).
  // Nullable and falls back to the desktop image if not set (see
  // publicContent.js) — existing banners created before this feature
  // keep working exactly as before without needing an immediate edit.
  try { db.run("ALTER TABLE homepage_banners ADD COLUMN image_url_mobile TEXT"); } catch(e) {}

  // Third device tier (Aug 2026, per KT) — a tablet-shaped viewport
  // (iPad, an unfolded Samsung Fold) sits between phone-portrait and
  // desktop; showing it the desktop 16:9 image via object-fit:contain
  // works but leaves more empty space than necessary. Same fallback
  // convention as image_url_mobile: nullable, falls back to the desktop
  // image if not set (see publicContent.js) — never required, never
  // breaks a banner that only has desktop + mobile images already.
  try { db.run("ALTER TABLE homepage_banners ADD COLUMN image_url_tablet TEXT"); } catch(e) {}

  // Shop-by-Need foundation (Aug 2026, per KT) — three independent
  // additions to products, all optional/backward-compatible:
  //
  // need_tags: which customer "need" categories this product belongs to
  // (Dental, Skin & Coat, Joints, Gut, Chewing, Enrichment, Treats) —
  // a product can belong to more than one, so this is stored as a JSON
  // array string (e.g. '["dental","chewing"]'), NOT a comma list — first
  // use of this pattern in this schema, parse/stringify at the route
  // boundary (see products.js). Defaults to '[]' (empty array), never
  // NULL, so callers can always safely JSON.parse it without a null check.
  //
  // best_for: short "Best for: X" line shown under the product name on
  // the website (e.g. "daily plaque control") — plain nullable text,
  // no display at all if unset.
  //
  // is_pawvy_pick: whether this shows in the homepage's admin-curated
  // "Pawvy's Picks" section (replaces the earlier sales-ranked
  // "Bestsellers" idea — KT wants editorial control, not an algorithm).
  try { db.run("ALTER TABLE products ADD COLUMN need_tags TEXT NOT NULL DEFAULT '[]'"); } catch(e) {}
  try { db.run("ALTER TABLE products ADD COLUMN best_for TEXT"); } catch(e) {}
  try { db.run("ALTER TABLE products ADD COLUMN is_pawvy_pick INTEGER NOT NULL DEFAULT 0"); } catch(e) {}

  console.log('✅ Schema ready');
}

module.exports = { init, getDb: () => ({ query, queryOne, run }), backupNow: () => persistToDisk(), getDbPath: () => DB_PATH };
