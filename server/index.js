const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { init } = require('./database');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

async function startServer() {
  const db  = await init();
  const adj = require('./routes/adjustments');

  app.use('/api/brands',      require('./routes/brands')(db));
  app.use('/api/products',    require('./routes/products')(db));
  app.use('/api/partners',    require('./routes/partners')(db));
  app.use('/api/sales',       require('./routes/sales')(db));
  app.use('/api/inventory',   require('./routes/inventory')(db));
  app.use('/api/costs',       require('./routes/costs')(db));
  app.use('/api/reports',     require('./routes/reports')(db));
  app.use('/api/adjustments', adj(db));
  app.use('/api/invoices',    adj.invoicesRouter(db));

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
}

startServer().catch(err => { console.error('Failed to start:', err); process.exit(1); });
