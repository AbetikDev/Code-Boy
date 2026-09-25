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
    await page.locator('[data-action="pet"]').click();
    await expect(page.locator('#state')).toHaveText('VERY HAPPY');
    await page.locator('[data-action="music"]').click();
    await expect(page.locator('[data-action="music"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#vibe-toggle').click();
    await expect(page.locator('#state')).toHaveText('VIBE CODING');
    await page.locator('[data-action="sleep"]').click();
    await expect(page.locator('#state')).toHaveText('SLEEPING');
    await page.locator('[data-action="sleep"]').click();
    await expect(page.locator('#state')).toHaveText('HAPPY');
    await page.locator('[data-panel="stats"]').first().click();
    await expect(page.locator('#drawer')).toBeVisible();
    await expect(page.locator('#drawer-content')).toContainText('CODING TOGETHER');
    await page.keyboard.press('Escape');
    await expect(page.locator('#drawer')).toBeHidden();
    await page.locator('[data-panel="room"]').click();
    await page.locator('[data-room="NIGHT"]').click();
    await expect(page.locator('[data-room="NIGHT"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-room="SPACE"]')).toBeDisabled();
    await page.keyboard.press('Escape');
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
