// @ts-check
const { test, expect } = require('@playwright/test');

test('share row builds WhatsApp and Telegram links for the current page and copies the link', async ({ page, context, browserName }) => {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/en/residence-2.html');
  const row = page.locator('[data-share]').first();
  const url = encodeURIComponent(page.url().split('#')[0]);
  await expect(row.locator('[data-share-wa]')).toHaveAttribute('href', new RegExp(`^https://wa\\.me/\\?text=.*${url}`));
  await expect(row.locator('[data-share-tg]')).toHaveAttribute('href', new RegExp(`^https://t\\.me/share/url\\?url=${url}`));
  await row.locator('[data-share-copy]').click();
  await expect(page.locator('#toast')).toHaveText('Link copied.');
  if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url().split('#')[0]);
});

test('Persian share row speaks Persian', async ({ page }) => {
  await page.goto('/compare.html');
  await expect(page.locator('[data-share-copy]')).toHaveText('کپی پیوند');
});

test('printing an apartment page shows only the one-page sheet, with the plan, area and a QR code', async ({ page }) => {
  await page.goto('/en/residence-4.html');
  await page.emulateMedia({ media: 'print' });
  const sheet = page.locator('.sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.sheet__title')).toHaveText('Apartment 4');
  await expect(sheet).toContainText('162 m²');
  await expect(sheet).toContainText('Area, as supplied');
  await expect(sheet.locator('.sheet__qr img')).toHaveAttribute('src', /assets\/img\/qr\/residence-4-en\.svg$/);
  await expect(sheet.locator('.sheet__plan img')).toBeVisible();
  for (const hidden of ['#header', '.footer', '#plan', '#residences-3d']) await expect(page.locator(hidden)).toBeHidden();
});

test('QR codes exist for every apartment in both languages', async ({ request }) => {
  for (const n of [1, 2, 3, 4]) for (const lang of ['fa', 'en']) {
    const r = await request.get(`/assets/img/qr/residence-${n}-${lang}.svg`);
    expect(r.status(), `qr ${n} ${lang}`).toBe(200);
    expect(await r.text()).toContain('<svg');
  }
});

test('every public page has its own share card that exists', async ({ page, request }) => {
  const seen = new Set();
  for (const url of ['/', '/en/', '/residence-2.html', '/en/residence-2.html', '/compare.html', '/en/brochure.html', '/gallery.html']) {
    await page.goto(url);
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og).toMatch(/\/assets\/og\/[\w-]+\.jpg$/);
    expect(seen.has(og)).toBe(false);
    seen.add(og);
    expect((await request.get(new URL(og).pathname)).status()).toBe(200);
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', og);
  }
});
