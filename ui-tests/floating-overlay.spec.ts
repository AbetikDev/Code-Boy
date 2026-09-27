import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { patchWorkbenchCsp } from '../src/overlay/WorkbenchCsp';
import { CodeBoyEngine } from '../src/core/CodeBoyEngine';
import { DEFAULT_SETTINGS } from '../src/models/types';

// Match the installed workbench's restrictions on connections, images and scripts.
const html = `<html><head><title>Visual Studio Code</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: ws:; img-src 'self' data: blob: https:; require-trusted-types-for 'script';"></head><body><script src="/floating-overlay.js"></script></body></html>`;

for (const repaired of [false, true]) {
  test(`floating mascot ${repaired ? 'renders with repaired CSP' : 'is blocked by original workbench CSP'}`, async ({ page }) => {
    const violations: string[] = [];
    const actions: string[] = [];
    const engine = new CodeBoyEngine(undefined, { ...DEFAULT_SETTINGS, floatingOverlay: true });
    const snapshot = engine.snapshot();
    engine.dispose();
    snapshot.stats.level = 2; snapshot.stats.mood = 38; snapshot.stats.energy = 100;
    snapshot.stats.xp = 85; snapshot.nextLevelXp = 200;
    snapshot.state = 'HAPPY'; snapshot.bubble = 'Clean code. Nice.';
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
      } else if (url.pathname === '/action') {
        actions.push(route.request().postDataJSON().action);
        await route.fulfill({ headers, json: { ok: true } });
      } else {
        await route.fulfill({ headers, contentType: 'text/event-stream', body: `data: ${JSON.stringify(snapshot)}\n\n` });
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
      await expect(page.locator('#codeboy-panel-xp')).toHaveText('85/200');
      await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '85');
      await page.locator('#codeboy-floating-panel').screenshot({ path: 'artifacts/overlay-panel.png' });
      for (const action of ['pet', 'play', 'music', 'settings', 'sleep']) {
        await page.locator(`[data-action="${action}"]`).click();
      }
      await expect.poll(() => actions).toEqual(['pet', 'play', 'music', 'settings', 'sleep']);
      await page.getByRole('button', { name: 'More' }).click();
      await expect(page.locator('[data-action="dance"]')).toBeVisible();
      await page.locator('[data-action="dance"]').click();
      await expect.poll(() => actions.at(-1)).toBe('dance');
      await page.keyboard.press('Escape');
      await expect(page.locator('#codeboy-floating-panel')).toBeHidden();
      await page.keyboard.press('Enter');
      await expect(page.locator('#codeboy-floating-panel')).toBeVisible();
      await page.setViewportSize({ width: 360, height: 500 });
      await expect(page.locator('#codeboy-floating-panel')).toHaveAttribute('data-compact', 'true');
      const bounds = await page.locator('#codeboy-floating-panel').boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(500);
      await page.evaluate(() => {
        const chat = document.createElement('div'); chat.className = 'chat-input-part';
        const prompt = document.createElement('textarea'); prompt.id = 'test-agent-prompt'; chat.append(prompt);
        const editor = document.createElement('div'); editor.className = 'monaco-editor';
        const code = document.createElement('textarea'); code.id = 'test-manual-code'; editor.append(code);
        document.body.append(chat, editor);
      });
      await page.locator('#test-agent-prompt').focus();
      await page.keyboard.type('help');
      await expect.poll(() => actions.at(-1)).toBe('activity.agent');
      await page.locator('#test-manual-code').focus();
      await page.keyboard.type('x');
      await expect.poll(() => actions.at(-1)).toBe('activity.manual');
      // Real extension webviews can live outside their sidebar's DOM tree and
      // have a generic title, so ancestor labels alone cannot identify Codex.
      await page.evaluate(() => {
        const pane = document.createElement('div'); pane.className = 'part auxiliarybar';
        pane.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:400px';
        const tab = document.createElement('div'); tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', 'true'); tab.textContent = 'Codex'; pane.append(tab);
        const frame = document.createElement('iframe'); frame.id = 'test-agent-frame'; frame.title = 'Webview';
        frame.style.cssText = 'position:fixed;left:0;top:40px;width:300px;height:300px';
        document.body.append(pane, frame); frame.focus();
      });
      await expect.poll(() => actions.at(-1), { timeout: 7000 }).toBe('activity.agent');
    } else {
      await expect.poll(() => violations.some(value => value.includes('connect-src'))).toBe(true);
      expect(await painted()).toBe(false);
    }
  });
}
