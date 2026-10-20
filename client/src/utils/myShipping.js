// Malaysia delivery reminder (label only — nothing is calculated or charged
// automatically; shipping charged / actual cost stay manually typed, like SG).
// West Malaysia: orders above MYR 600 delivered free, below that a MYR 25 fee.
// East Malaysia: decided case by case.
export function myShippingReminder(partner) {
  if (!partner || partner.market !== 'MY') return null;
  if (partner.shipping_zone === 'East') return 'East Malaysia — delivery charge decided case by case';
  return '≥ MYR 600 free delivery, below MYR 600 a MYR 25 delivery fee (West Malaysia)';
}
