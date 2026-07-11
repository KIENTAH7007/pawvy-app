const { computeSuggestions } = require('../utils/restockSuggestions');

// Auto-populates a Restock Checklist with current suggestions, instead of
// pushing a repeating Telegram/email nag for the same low-stock items
// every day (which was genuinely annoying for anything deliberately being
// deferred — e.g. bulky SKUs not worth a special trip). Runs daily, but:
//
//   - If a "Suggested Restock" checklist is already open (status='draft'),
//     leaves it alone entirely. Never spams a second one while the last
//     one is still being worked through.
//   - Only creates a fresh one once the previous auto-generated checklist
//     has been completed (or none exists yet).
//
// KT keeps full control once it's created — remove any SKU, adjust
// quantities, complete whenever. This just makes sure it's sitting there
// ready rather than something he has to remember to go generate himself.
const CHECKLIST_LABEL_PREFIX = 'Suggested Restock';

async function runAutoRestock(db) {
  const existingOpen = db.queryOne(`
    SELECT id FROM restock_checklists
    WHERE status = 'draft' AND label LIKE ?
    ORDER BY created_at DESC LIMIT 1
  `, [`${CHECKLIST_LABEL_PREFIX}%`]);

  if (existingOpen) {
    console.log(`ℹ️  Auto-restock: checklist #${existingOpen.id} is still open, leaving it as-is.`);
    return;
  }

  const suggestions = computeSuggestions(db);
  if (suggestions.length === 0) {
    console.log('ℹ️  Auto-restock: nothing to suggest today.');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const label = `${CHECKLIST_LABEL_PREFIX} — ${today}`;

  const result = db.run(
    `INSERT INTO restock_checklists (label, direction, status) VALUES (?, 'storhub_to_home', 'draft')`,
    [label]
  );
  const checklistId = result.lastID;

  suggestions.forEach(s => {
    db.run(
      `INSERT INTO restock_checklist_items (checklist_id, product_id, qty_planned) VALUES (?, ?, ?)`,
      [checklistId, s.product_id, s.suggested_qty]
    );
  });

  console.log(`✅ Auto-restock: created checklist #${checklistId} ("${label}") with ${suggestions.length} suggested item(s).`);
}

module.exports = { runAutoRestock };
