const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const cron    = require('node-cron');
const { init, backupNow, getDbPath } = require('./database');
const { runDailyDigest } = require('./jobs/dailyDigest');
const { runDailyBackup } = require('./jobs/backup');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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

  // PIN gate — applies to every /api/* route EXCEPT /api/auth (handled above)
  // and /api/portal (must stay reachable with no login, since Order Portal
  // customers never see or use a PIN).
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/portal')) return next();
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
  app.use('/api/orders',      require('./routes/orders')(db, inventoryRouter));
  app.use('/api/shipments',   require('./routes/shipments')(db, inventoryRouter));
  app.use('/api/restock',     require('./routes/restock')(db, inventoryRouter));

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
}

startServer().catch(err => { console.error('Failed to start:', err); process.exit(1); });
