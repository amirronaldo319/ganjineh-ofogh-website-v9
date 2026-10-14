// @ts-check
const { test, expect } = require('@playwright/test');

// The service worker only registers on HTTPS (or with ?sw=1, used here), so ordinary local runs are unaffected.
test.describe.configure({ timeout: 60_000 });
test.skip(({ browserName }) => browserName !== 'chromium', 'worker scope behaviour is checked in Chromium; WebKit in CI has its own SW quirks');

async function ready(page, path) {
  await page.goto(path);
  await page.evaluate(() => navigator.serviceWorker.ready);
  // the page hands over what it has loaded 1.5 s after load
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    if (!keys.length) return false;
    const cache = await caches.open(keys[0]);
    return (await cache.keys()).length > 3;
  }, null, { timeout: 20_000 });
}

test('registers, stores unchanging files, and drops caches from older builds', async ({ page }) => {
  await page.goto('/en/index.html?sw=1');
  await page.evaluate(async () => { await caches.open('ofogh-0000000old'); });
  await ready(page, '/en/index.html?sw=1');
  const state = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find((k) => !k.endsWith('0000000old')) || keys[0]);
    const urls = (await cache.keys()).map((r) => new URL(r.url).pathname);
    return { keys, urls };
  });
  expect(state.keys.filter((k) => k.startsWith('ofogh-')).length).toBe(1);   // the old one was deleted on activation
  expect(state.urls.some((u) => /\/assets\/img\/.+\.(avif|webp)$/.test(u))).toBe(true);
  expect(state.urls.some((u) => /\/assets\/fonts\/.+\.woff2$/.test(u))).toBe(true);
  expect(state.urls.every((u) => !/\/api\//.test(u))).toBe(true);
});

test('a returning visitor keeps working with the network gone; the API is never answered from cache', async ({ page, context }) => {
  await ready(page, '/en/index.html?sw=1');
  await page.goto('/en/residences.html?sw=1');          // a second page, so its HTML is stored too
  await page.waitForTimeout(500);
  await context.setOffline(true);
  await page.goto('/en/index.html?sw=1');
  await expect(page.locator('h1')).toBeVisible();
  const imagesOk = await page.evaluate(() => [...document.images].filter((i) => i.currentSrc && i.complete && i.naturalWidth > 0).length);
  expect(imagesOk).toBeGreaterThan(0);
  const api = await page.evaluate(() => fetch('/api/status').then((r) => r.status, () => 'network-error'));
  expect(api).toBe('network-error');
  await context.setOffline(false);
});

test('without ?sw=1 on a local http page nothing is registered', async ({ page }) => {
  await page.goto('/en/index.html');
  await page.waitForTimeout(2500);
  const regs = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length));
  expect(regs).toBe(0);
});
