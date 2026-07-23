const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const dns     = require('dns');
const cron    = require('node-cron');
const { init, backupNow, getDbPath } = require('./database');
const { runDailyDigest } = require('./jobs/dailyDigest');
const { runDailyBackup } = require('./jobs/backup');
const { runAutoRestock } = require('./jobs/autoRestock');
const { runButtonsHoldCheck } = require('./jobs/buttonsHold');

// Railway's container has no outbound IPv6 route — confirmed via a live
// ENETUNREACH error connecting to smtp.gmail.com (Google's mail servers
// publish both IPv4 and IPv6 addresses; Node was picking the unreachable
// IPv6 one). This changes Node's default DNS resolution order application-
// wide, so any outbound connection by hostname (not just email) resolves
// IPv4 first. Must run before anything else does DNS lookups.
dns.setDefaultResultOrder('ipv4first');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
// Default express.json() body limit is 100kb, which silently rejects (413) larger
// base64 payloads such as scanned PDFs/images uploaded via Shipments > Documents.
// Raised to 15mb to comfortably cover multi-page scans and photos while still
// bounding request size.
app.use(express.json({ limit: '15mb' }));

async function startServer() {
  const db  = await init();
  const adj = require('./routes/adjustments');

  const consignmentRouter = require('./routes/consignment')(db);
  const inventoryRouter   = require('./routes/inventory')(db, consignmentRouter);
  consignmentRouter._setInventoryHook(inventoryRouter._recordMovement); // resolve circular dependency

  const auth = require('./auth')(db);
  app.post('/api/auth/login',  auth.login);
  app.post('/api/auth/logout', auth.logout);
  app.get('/api/auth/me', auth.requireAuth, auth.me);

  // Public healthcheck for Railway (see railway.json) — must never require
  // a PIN, otherwise Railway's automated healthcheck request gets a 401
  // and the deploy is marked unhealthy/failed.
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // PIN gate — applies to every /api/* route EXCEPT /api/auth (handled
  // above), /api/health (Railway's healthcheck), /api/portal and /api/pos
  // (must stay reachable with no login — Order Portal and POS System
  // customers never see or use a PIN), and /api/customers (the future
  // pawvy.co website's own visitors — a completely separate customer-facing
  // auth system, not the internal staff PIN).
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/portal') || req.path.startsWith('/pos') || req.path.startsWith('/customers') || req.path.startsWith('/shop') || req.path === '/health') return next();
    return auth.requireAuth(req, res, next);
  });

  app.use('/api/consignment', consignmentRouter);
  app.use('/api/brands',      require('./routes/brands')(db));
  app.use('/api/products',    require('./routes/products')(db));
  app.use('/api/partners',    require('./routes/partners')(db));
  app.use('/api/sales',       require('./routes/sales')(db, inventoryRouter));
  app.use('/api/inventory',   inventoryRouter);
  app.use('/api/forecast',    require('./routes/forecast')(db));
  app.use('/api/costs',       require('./routes/costs')(db));
  app.use('/api/reports',     require('./routes/reports')(db));
  app.use('/api/adjustments', adj(db));
  app.use('/api/invoices',    require('./routes/invoices')(db));
  app.use('/api/portal',      require('./routes/portal')(db));
  app.use('/api/pos',         require('./routes/pos')(db, inventoryRouter));
  app.use('/api/orders',      require('./routes/orders')(db, inventoryRouter));
  app.use('/api/shipments',   require('./routes/shipments')(db, inventoryRouter));
  app.use('/api/restock',     require('./routes/restock')(db, inventoryRouter));
  app.use('/api/customers',   require('./routes/customers')(db));
  app.use('/api/shop',        require('./routes/shop')(db));
  app.use('/api/customer-admin', require('./routes/customerAdmin')(db));
  app.use('/api/campaigns',   require('./routes/campaigns')(db));

  // Order Portal (public-facing, separate build) — served under /order.
  // Registered BEFORE the internal app's catch-all below, so /order/* requests
  // are handled here first and never fall through to the internal app's index.html.
  const portalBuild = path.join(__dirname, '..', 'portal', 'dist');
  if (fs.existsSync(path.join(portalBuild, 'index.html'))) {
    app.use('/order', express.static(portalBuild));
    app.get('/order/*', (req, res) => res.sendFile(path.join(portalBuild, 'index.html')));
    console.log(`📁  Order Portal: ${portalBuild}`);
  } else {
    console.log('⚠️   No Order Portal build found (skipping — internal app is unaffected).');
  }

  // POS System (public-facing, separate build) — served under /pos, same
  // pattern as the Order Portal above.
  const posBuild = path.join(__dirname, '..', 'pos', 'dist');
  if (fs.existsSync(path.join(posBuild, 'index.html'))) {
    app.use('/pos', express.static(posBuild));
    app.get('/pos/*', (req, res) => res.sendFile(path.join(posBuild, 'index.html')));
    console.log(`📁  POS System: ${posBuild}`);
  } else {
    console.log('⚠️   No POS System build found (skipping — internal app is unaffected).');
  }

  // Serve React frontend — check multiple locations
  const candidates = [
    path.join(__dirname, '..', 'client', 'dist'),  // Railway (built during deploy)
    path.join(__dirname, 'public'),                  // Pre-built (local Windows zip)
  ];
  const clientBuild = candidates.find(p => fs.existsSync(path.join(p, 'index.html')));

  if (clientBuild) {
    app.use(express.static(clientBuild));
    app.get('*', (req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
    console.log(`📁  Frontend: ${clientBuild}`);
  } else {
    console.log('⚠️   No frontend build found.');
  }

  app.listen(PORT, () => {
    console.log(`\n🐾  Pawvy is ready on port ${PORT}`);
    const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
    if (isRailway) {
      console.log(`🌐  Live at your Railway URL\n`);
    } else {
      console.log(`🌐  Local: http://localhost:${PORT}\n`);
    }
  });

  // ── Scheduled jobs (Singapore time, DST-free so a fixed cron is safe) ──
  cron.schedule('0 9 * * *', () => {
    console.log('⏰ Running daily digest…');
    runDailyDigest(db).catch(err => console.error('⚠️  Daily digest failed:', err.message));
  }, { timezone: 'Asia/Singapore' });

  cron.schedule('0 3 * * *', () => {
    console.log('⏰ Running daily backup…');
    runDailyBackup(backupNow, getDbPath).catch(err => console.error('⚠️  Daily backup failed:', err.message));
  }, { timezone: 'Asia/Singapore' });

  cron.schedule('0 8 * * *', () => {
    console.log('⏰ Running auto-restock check…');
    runAutoRestock(db).catch(err => console.error('⚠️  Auto-restock failed:', err.message));
  }, { timezone: 'Asia/Singapore' });

  cron.schedule('0 4 * * *', () => {
    console.log('⏰ Running BUTTONS hold check…');
    runButtonsHoldCheck(db).catch(err => console.error('⚠️  BUTTONS hold check failed:', err.message));
  }, { timezone: 'Asia/Singapore' });
}

startServer().catch(err => { console.error('Failed to start:', err); process.exit(1); });
