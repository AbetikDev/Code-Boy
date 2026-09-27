function totalAfterDiscount(subtotal) {
  if (!Number.isFinite(subtotal) || subtotal < 0) throw new RangeError('subtotal must be nonnegative');
  return subtotal >= 100 ? subtotal * 0.9 : subtotal;
}

module.exports = { totalAfterDiscount };
