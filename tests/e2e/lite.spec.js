// @ts-check
const { test, expect } = require('@playwright/test');


async function withConnection(page, conn) {
  await page.addInitScript((c) => { Object.defineProperty(navigator, 'connection', { value: c, configurable: true }); }, conn);
}

test('a slow connection switches to lite mode: same content, no decorative layers', async ({ page }) => {
  await withConnection(page, { effectiveType: '3g', saveData: false });
  await page.goto('/index.html');
  await expect(page.locator('html')).toHaveAttribute('data-lite', '1');
  await page.waitForTimeout(600);
  expect(await page.locator('.totop, .motes, .stars').count()).toBe(0);     // the motion script stood down
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.hero__title .en')).toBeVisible();
  // revealed sections are visible without scroll-triggered animation
  await page.locator('#philosophy, .intro').first().scrollIntoViewIfNeeded().catch(() => {});
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.rv')).opacity)).toBe('1');
});

test('Data Saver also turns lite mode on', async ({ page }) => {
  await withConnection(page, { effectiveType: '4g', saveData: true });
  await page.goto('/en/residences.html');
  await expect(page.locator('html')).toHaveAttribute('data-lite', '1');
});

test('a normal connection keeps the full experience', async ({ page }) => {
  await withConnection(page, { effectiveType: '4g', saveData: false });
  await page.goto('/index.html');
  await expect(page.locator('html')).not.toHaveAttribute('data-lite', '1');
  await page.waitForFunction(() => !!window.ofogh);
  expect(await page.locator('.visit .motes').count()).toBe(1);
});
