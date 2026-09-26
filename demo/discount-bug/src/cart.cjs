function totalAfterDiscount(subtotal) {
  if (!Number.isFinite(subtotal) || subtotal < 0) throw new RangeError('subtotal must be nonnegative');
  // Demo blocker: orders exactly at the threshold should receive the discount.
  return subtotal > 100 ? subtotal * 0.9 : subtotal;
}

module.exports = { totalAfterDiscount };
