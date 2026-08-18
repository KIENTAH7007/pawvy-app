// Canonical Shop-by-Need tags (Aug 2026) — single source of truth for
// the backend. Both server/routes/products.js (validates need_tags on
// products) and server/routes/testimonials.js (validates each
// testimonial's single need_tag) import from here, so the two can never
// drift out of sync with each other the way products.js and the admin
// UI briefly did before this file existed.
//
// Slugs match the /shop?need= query param the website will use later —
// a tag stored anywhere plugs directly into that route with no
// translation layer needed.
//
// Order matters here: this is also the confirmed display order for the
// homepage need cards and Shop filter, per KT (Aug 2026):
// Skin & Coat → Chew → Enrichment → Gut → Food → Dental → Grooming → Joints
const NEED_TAGS = ['skin-coat', 'chew', 'enrichment', 'gut', 'food', 'dental', 'grooming', 'joints'];

module.exports = { NEED_TAGS };
