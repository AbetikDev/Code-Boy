import test from 'node:test';
import assert from 'node:assert/strict';
import { hasOverlayCsp, patchWorkbenchCsp, unpatchWorkbenchCsp } from '../src/overlay/WorkbenchCsp';

const html = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; connect-src 'self' https: ws:; img-src 'self' blob:;"></head><body></body></html>`;

test('overlay CSP permits only its loopback ports and restores the exact original HTML', () => {
  const patched = patchWorkbenchCsp(html);
  assert.equal(hasOverlayCsp(html), false);
  assert.equal(hasOverlayCsp(patched), true);
  assert.match(patched, /script-src 'self';/);
  assert.match(patched, /img-src 'self' blob:;/);
  assert.equal(patchWorkbenchCsp(patched), patched);
  assert.equal(unpatchWorkbenchCsp(patched), html);
  assert.equal(unpatchWorkbenchCsp(html), html);
});

test('unknown workbench policy fails without rewriting HTML', () => {
  assert.throws(() => patchWorkbenchCsp('<html></html>'), /connect-src/);
});
