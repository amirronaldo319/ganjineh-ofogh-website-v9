// @ts-check
const { test, expect } = require('@playwright/test');

// WebGL in headless engines is software-rendered and slows sharply on a busy machine.
test.describe.configure({ timeout: 90_000 });

test('apartment viewer opens the requested apartment without script errors, in Persian', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/residences-3d/index.html?apt=3&lang=fa');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#plan-title')).toHaveText('واحد ۳');
  await expect(page.locator('#room-count')).toHaveText('۳ اتاق خواب');
  await expect(page.locator('#loading')).toBeHidden();
  expect(errors).toEqual([]);
});

test('legacy ?type= links resolve by layout shape (type-d → apartment 2)', async ({ page }) => {
  await page.goto('/residences-3d/index.html?type=d&lang=en');
  await expect(page.locator('#plan-title')).toHaveText('Apartment 2');
});

test('English: no Persian text remains, areas are the v25 figures, links point at /en/', async ({ page }) => {
  await page.goto('/residences-3d/index.html?apt=1&lang=en');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const joined = (await page.locator('#plans .plancard').allTextContents()).join(' ');
  for (const area of ['143.25', '150', '166', '162']) expect(joined).toContain(area);
  const leftovers = await page.evaluate(() => [...document.querySelectorAll('body *')]
    .filter((e) => e.children.length === 0 && e.id !== 'lang-btn' && /[؀-ۿ]/.test(e.textContent || ''))
    .map((e) => (e.textContent || '').trim().slice(0, 40)));
  expect(leftovers).toEqual([]);
  expect(await page.locator('a.backlink').getAttribute('href')).toBe('../en/residences.html');
});

test('3D viewers load only on request, from the page\'s own language folder', async ({ page }) => {
  await page.goto('/en/residence-2.html');
  await expect(page.locator('#res3d iframe')).toHaveCount(0);
  await page.locator('#res3d-launch').click();
  await expect(page.locator('#res3d iframe')).toHaveCount(1);
  await expect(page.locator('#res3d iframe')).toHaveAttribute('src', /^\.\.\/residences-3d\/index\.html\?lang=en/);
  const frame = page.frameLocator('#res3d iframe');
  await expect(frame.locator('#plan-title')).toHaveText('Apartment 2');
  await expect(frame.locator('body > header')).toBeHidden();

  await page.goto('/en/index.html');
  await expect(page.locator('#viewer iframe')).toHaveCount(0);
  await page.locator('#launch').click();
  await expect(page.locator('#viewer iframe')).toHaveCount(1);
  await expect(page.locator('#viewer iframe')).toHaveAttribute('src', '../tower-viewer/index.html');
});

test('gallery link from a room photo resolves to a real gallery image', async ({ page }) => {
  await page.goto('/gallery.html?photo=bath');
  await expect(page.locator('#lb')).toHaveAttribute('open', '');
});
