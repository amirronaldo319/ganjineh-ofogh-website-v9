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

test.describe('tower viewer: time of day and apartment deep link', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'headless WebKit WebGL is covered by the launch test only');
  test.skip(!!process.env.NO_GPU, 'the tower viewer needs a real GPU; software WebGL on hosted CI is too slow');

  const ready = (page) => page.waitForFunction(() => document.querySelector('#status')?.classList.contains('gone'), null, { timeout: 80_000 });

  test('the time-of-day slider blends the presets and keeps the buttons honest', async ({ page }) => {
    await page.goto('/tower-viewer/index.html?lang=en#nointro');
    await ready(page);
    await page.locator('[data-tab="light"]').click();
    const slider = page.locator('#tod');
    await expect(slider).toBeVisible();
    await expect(slider).toHaveValue('0');

    await slider.fill('100');
    await expect(page.locator('body')).toHaveClass(/night/);
    await expect(slider).toHaveAttribute('aria-valuetext', 'Night');
    await expect(page.locator('[data-light="night"]')).toHaveAttribute('aria-pressed', 'true');

    await slider.fill('30');    // between day and golden: no preset button claims it
    await expect(page.locator('body')).not.toHaveClass(/night/);
    await expect(page.locator('[data-light][aria-pressed="true"]')).toHaveCount(0);

    // A preset button still works after dragging, and moves the slider to its stop.
    await page.locator('[data-light="golden"]').click();
    await expect.poll(() => slider.inputValue()).toBe('50');
  });

  test('?apt=2&floor=6 opens Floors mode with Apartment 2 selected', async ({ page }) => {
    await page.goto('/tower-viewer/index.html?lang=en&apt=2&floor=6');
    await ready(page);
    await expect(page.locator('#o-floors')).toBeVisible();
    await expect(page.locator('#apt-name')).toHaveText('Apartment 2');
    await expect(page.locator('.chip[data-apt="apt2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#floor-range')).toHaveValue('6');
  });

  test('residence pages link to the apartment in the tower, in the page language', async ({ page }) => {
    await page.goto('/en/residence-4.html');
    await expect(page.locator('#where-link')).toHaveAttribute('href', /\.\.\/tower-viewer\/index\.html\?apt=4&floor=6&lang=en$/);
    await page.goto('/residence-4.html');
    await expect(page.locator('#where-link')).toHaveAttribute('href', /tower-viewer\/index\.html\?apt=4&floor=6&lang=fa$/);
  });
});

test('tower viewer: a shared link restores the named view and light, and "Copy link" builds one', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permission is checked in Chromium');
  test.skip(!!process.env.NO_GPU, 'the tower viewer needs a real GPU; software WebGL on hosted CI is too slow');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/tower-viewer/index.html?lang=en&view=street&light=night');
  await expect(page.locator('#status')).toHaveClass(/gone/, { timeout: 60_000 });
  await expect(page.locator('[data-view="street"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-light="night"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-tab="more"]').click();
  await page.locator('#t-share').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const url = new URL(copied);
  expect(url.pathname).toMatch(/tower-viewer\/index\.html$/);
  expect(url.searchParams.get('view')).toBe('street');
  expect(url.searchParams.get('light')).toBe('night');
  expect(url.searchParams.get('lang')).toBe('en');
  expect(errors).toEqual([]);
});
