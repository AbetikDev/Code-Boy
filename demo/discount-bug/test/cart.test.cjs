const test = require('node:test');
const assert = require('node:assert/strict');
const { totalAfterDiscount } = require('../src/cart.cjs');

test('below the threshold has no discount', () => {
  assert.equal(totalAfterDiscount(80), 80);
});

test('the threshold is eligible for the discount', () => {
  assert.equal(totalAfterDiscount(100), 90);
});
