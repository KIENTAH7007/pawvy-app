# 🐾 Pawvy Business Manager

Your personal business management system — replacing the Excel tracker with a proper app.

---

## First-Time Setup (do this once)

### 1. Install Node.js
Download from https://nodejs.org — choose the **LTS** version.
After installing, restart your computer.

### 2. Place the app folder
Put the `pawvy-app` folder anywhere convenient — e.g. `C:\Users\YourName\pawvy-app`

### 3. Import your existing Excel data (one-time migration)
Open a Command Prompt, navigate to the pawvy-app folder, and run:

```
node migrate.js "C:\path\to\Tracking_File_2026.xlsm"
```

This imports your:
- Products & price list (219 SKUs)
- All historical sales from Raw_(SG)

---

## Starting the App

**Windows:** Double-click `START.bat`

**Mac / Linux:** Open Terminal, `cd` to the folder and run `./start.sh`

Then open your browser to: **http://localhost:3001**

The app runs fully offline — no internet needed after first launch.

---

## Daily Workflow

| Task | Where to go |
|---|---|
| Record a sale | **Record Sale** (sidebar) |
| View all sales | **Sales Ledger** |
| Add / update product prices | **Products & Pricing** |
| Check stock levels | **Inventory** |
| Log an expense | **Operating Costs** |
| View P&L for tax | **Reports & P&L** → set date range → Run |

---

## Your Data

All data lives in: `pawvy-app/data/pawvy.db`

**Back up this file regularly** — copy it to Google Drive or an external drive.
Everything is stored there: products, sales, costs, partners.

---

## Phases

| Phase | Status | Contents |
|---|---|---|
| Phase 1 | ✅ Done | Dashboard, Sales Entry, Products, Partners, Costs, P&L Reports, Inventory |
| Phase 2 | 🔜 Next | Consignment tracking, SOA generation, PDF consignment lists |
| Phase 3 | 🔜 Soon | Invoice & Delivery Order PDF generator, SOA per partner |
| Phase 4 | Coming | MY market full activation, AUD pricing, multi-currency reports |

---

## Support

Built with: Express.js + SQLite + React + Vite  
Data file: `data/pawvy.db` (SQLite, portable, single file)
