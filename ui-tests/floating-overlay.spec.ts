import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { patchWorkbenchCsp } from '../src/overlay/WorkbenchCsp';

// Match the installed workbench's restrictions on connections, images and scripts.
const html = `<html><head><title>Visual Studio Code</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: ws:; img-src 'self' data: blob: https:; require-trusted-types-for 'script';"></head><body><script src="/floating-overlay.js"></script></body></html>`;

for (const repaired of [false, true]) {
  test(`floating mascot ${repaired ? 'renders with repaired CSP' : 'is blocked by original workbench CSP'}`, async ({ page }) => {
    const violations: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error') violations.push(message.text());
    });
    await page.route('**/floating-overlay.js', route => route.fulfill({
      contentType: 'application/javascript', body: readFileSync('media/floatingOverlay.js')
    }));
    await page.route('http://127.0.0.1:4382*/**', async route => {
      const url = new URL(route.request().url());
      const headers = { 'Access-Control-Allow-Origin': '*' };
      if (url.pathname === '/health') {
        await route.fulfill({ headers, json: { appName: 'Visual Studio Code' } });
      } else if (url.pathname === '/manifest') {
        await route.fulfill({ headers, contentType: 'application/json', body: readFileSync('assets/manifest.json') });
      } else if (url.pathname.startsWith('/assets/')) {
        await route.fulfill({ headers, contentType: 'image/png', body: readFileSync(url.pathname.slice(1)) });
      } else {
        await route.fulfill({ headers, contentType: 'text/event-stream', body: ':connected\n\n' });
      }
    });
    await page.route('**/overlay-test', route => route.fulfill({
      contentType: 'text/html', body: repaired ? patchWorkbenchCsp(html) : html
    }));
    await page.goto('/overlay-test');
    const painted = () => page.locator('#codeboy-floating-canvas').evaluate((canvas: HTMLCanvasElement) =>
      canvas.getContext('2d')!.getImageData(0, 0, 64, 64).data.some((value, index) => index % 4 === 3 && value > 0));
    if (repaired) {
      await expect.poll(painted).toBe(true);
      await expect(page.locator('#codeboy-floating-root')).toBeVisible();
      await page.locator('#codeboy-floating-canvas').click();
      await expect(page.locator('#codeboy-floating-panel')).toBeVisible();
    } else {
      await expect.poll(() => violations.some(value => value.includes('connect-src'))).toBe(true);
      expect(await painted()).toBe(false);
    }
  });
}
