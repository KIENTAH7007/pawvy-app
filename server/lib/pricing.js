// Shared between server/routes/products.js (staff) and server/routes/shop.js
// (public) — one place that knows how to turn a product's raw
// discount_pct/discount_start/discount_end (Patch 96 schema, Patch 104
// logic) into whether a discount is active today and what the resulting
// price is. Extracted here specifically so the public shop route can reuse
// this without duplicating the date-window math.
function withEffectivePrice(product) {
  const today = new Date().toISOString().slice(0, 10);
  const hasDiscount = product.discount_pct > 0
    && (!product.discount_start || product.discount_start <= today)
    && (!product.discount_end || product.discount_end >= today);

  // Same today-vs-window comparison as the discount above, just with no
  // start date to check (a "New" badge is live from whenever the toggle
  // was switched on, not scheduled in advance) — see the schema comment
  // in server/database.js for why this is intentionally simpler.
  const isNewActive = !!product.is_new
    && (!product.new_until || product.new_until >= today);

  return {
    ...product,
    is_discount_active: hasDiscount,
    effective_price_rrp_sg: hasDiscount
      ? Math.round(product.price_rrp_sg * (1 - product.discount_pct / 100) * 100) / 100
      : product.price_rrp_sg,
    is_new_active: isNewActive,
  };
}

function stockStatus(totalQty) {
  if (totalQty <= 0) return 'out_of_stock';
  if (totalQty <= 5) return 'low_stock';
  return 'available';
}

module.exports = { withEffectivePrice, stockStatus };
