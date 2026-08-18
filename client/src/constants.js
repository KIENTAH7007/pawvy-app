// Canonical Shop-by-Need tags (Aug 2026) — single source of truth for
// the admin UI. Must match NEED_TAGS in server/lib/needTags.js exactly
// (same slugs, same order) — both Products.jsx (multi-select need tags
// per product) and Marketing.jsx's Testimonials section (single need
// tag per testimonial) import from here.
export const NEED_TAG_OPTIONS = [
  { value: 'skin-coat',  label: 'Skin & Coat' },
  { value: 'chew',       label: 'Chew' },
  { value: 'enrichment', label: 'Enrichment' },
  { value: 'gut',        label: 'Gut' },
  { value: 'food',       label: 'Food' },
  { value: 'dental',     label: 'Dental' },
  { value: 'grooming',   label: 'Grooming' },
  { value: 'joints',     label: 'Joints' },
];
