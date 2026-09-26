import { test, expect } from '@playwright/test';

for (const width of [200, 250, 300, 400]) {
  test(`pixel room fits ${width}px and controls work`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('#state')).toHaveText('IDLE');
    await expect(page.locator('#connection-note')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const scale = await page.locator('#scene').evaluate((canvas: HTMLCanvasElement) => canvas.getBoundingClientRect().width / canvas.width);
    expect([1, 2, 3, 4]).toContain(scale);

    // Open action menu and pet
    await page.locator('#character-target').click({ button: 'right' });
    await expect(page.locator('#action-menu')).toBeVisible();
    await page.locator('#action-menu [data-action="pet"]').click();
    await expect(page.locator('#state')).toHaveText('VERY HAPPY');

    // Toggle music
    await page.locator('#character-target').click({ button: 'right' });
    await page.locator('#am-music').click();

    // Toggle vibe mode
    await page.locator('#character-target').click({ button: 'right' });
    await page.locator('#am-vibe').click();
    await expect(page.locator('#state')).toHaveText('VIBE CODING');

    // Sleep and wake
    await page.locator('#character-target').click({ button: 'right' });
    await page.locator('#am-sleep').click();
    await expect(page.locator('#state')).toHaveText('SLEEPING');
    await page.locator('#character-target').click({ button: 'right' });
    await page.locator('#am-sleep').click();
    await expect(page.locator('#state')).toHaveText('HAPPY');

    // Stats drawer
    await page.locator('#character-target').click({ button: 'right' });
    await page.locator('#action-menu [data-panel="stats"]').click();
    await expect(page.locator('#drawer')).toBeVisible();
    await expect(page.locator('#drawer-content')).toContainText('CODING TOGETHER');
    await page.keyboard.press('Escape');
    await expect(page.locator('#drawer')).toBeHidden();

    // Room theme selector drawer
    await page.locator('#character-target').click({ button: 'right' });
    await page.locator('#action-menu [data-panel="room"]').click();
    await expect(page.locator('#drawer')).toBeVisible();
    await page.locator('[data-room="NIGHT"]').click();
    await expect(page.locator('[data-room="NIGHT"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-room="SPACE"]')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('#drawer')).toBeHidden();

    await page.screenshot({ path: `artifacts/code-boy-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('reduced motion, keyboard dialog and sprite gallery', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('IDLE');
  const before = await page.locator('#scene').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.waitForTimeout(500);
  expect(await page.locator('#scene').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(before);
  await page.locator('#dev-toggle').click();
  await page.locator('[data-panel="gallery"]').click();
  await expect(page.locator('#gallery-select')).toBeVisible();
  await page.locator('#gallery-select').selectOption('vibe_coding_loop');
  await expect(page.locator('#gallery-metadata')).toContainText('8 FRAMES');
  await page.locator('#gallery-pause').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#drawer')).toBeHidden();
});

test('character direct clicks: single click looks, double click pets', async ({ page }) => {
  await page.setViewportSize({ width: 350, height: 800 });
  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('IDLE');

  // Double click triggers pet
  await page.locator('#character-target').dblclick();
  await expect(page.locator('#state')).toHaveText('VERY HAPPY');

  // Single click triggers look / thinking
  await page.waitForTimeout(4600); // wait for revert to IDLE
  await page.locator('#character-target').click();
  await expect(page.locator('#state')).toHaveText('THINKING');
  await expect(page.locator('#speech')).toHaveText('oh. hi.');
});

test('action menu: dance and play actions', async ({ page }) => {
  await page.setViewportSize({ width: 350, height: 800 });
  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('IDLE');

  // Dance action
  await page.locator('#character-target').click({ button: 'right' });
  await page.locator('#action-menu [data-action="dance"]').click();
  await expect(page.locator('#state')).toHaveText('DANCING');
  await expect(page.locator('#speech')).toHaveText('compiled with rhythm.');

  // Play action
  await page.locator('#character-target').click({ button: 'right' });
  await page.locator('#action-menu [data-action="play"]').click();
  await expect(page.locator('#state')).toHaveText('HAPPY');
  await expect(page.locator('#speech')).toHaveText('one quick game.');
});

test('sprite lab debug panel controls: state override, mood slider, random events', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 850 });
  await page.goto('/');

  // Toggle debug panel
  await page.locator('#dev-toggle').click();
  await expect(page.locator('#debug-panel')).toBeVisible();

  // Change state via select
  await page.locator('#debug-state').selectOption('ERROR');
  await expect(page.locator('#state')).toHaveText('ERROR');

  // Set mood and energy
  await page.locator('#debug-mood').fill('42');
  await page.locator('#debug-mood').dispatchEvent('input');

  // Click random event
  await page.locator('#random-event').click();
  await expect(page.locator('#speech')).toHaveText('sprite lab.');
});

test('settings toggle in action menu', async ({ page }) => {
  await page.setViewportSize({ width: 350, height: 800 });
  await page.goto('/');

  await page.locator('#character-target').click({ button: 'right' });
  await page.locator('#am-settings').click();
  await expect(page.locator('#speech')).toContainText('preview only.');
});

