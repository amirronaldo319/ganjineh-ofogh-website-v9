// @ts-check
const { test, expect } = require('@playwright/test');

test('plan explorer: pins and buttons switch the apartment and its area', async ({ page }) => {
  await page.goto('/en/residences.html');
  await expect(page.locator('#apt-name')).toHaveText('Apartment 1 · Three bedrooms');
  await expect(page.locator('#apt-area')).toHaveText('143.25m²');

  await page.locator('.pin[data-apt="3"]').click();
  await expect(page.locator('#apt-name')).toHaveText('Apartment 3 · Three bedrooms');
  await expect(page.locator('#apt-area')).toHaveText('166m²');
  await expect(page.locator('#apt-img')).toHaveAttribute('src', /\.\.\/assets\/img\/apt3-/);
  await expect(page.locator('#apt-more')).toHaveAttribute('href', 'residence-3.html');

  await page.locator('.aptbtn[data-apt="4"]').click();
  await expect(page.locator('#apt-area')).toHaveText('162m²');
});

test('plan explorer in Persian uses Persian digits and unit', async ({ page }) => {
  await page.goto('/residences.html');
  await page.locator('.pin[data-apt="2"]').click();
  await expect(page.locator('#apt-name')).toHaveText('واحد ۲ · سه‌خوابه');
  await expect(page.locator('#apt-area')).toHaveText('۱۵۰متر مربع');
});

test('the four areas are the v25 figures on every surface', async ({ page }) => {
  const expected = { 1: '143.25', 2: '150', 3: '166', 4: '162' };
  for (const [n, area] of Object.entries(expected)) {
    await page.goto(`/en/residence-${n}.html`);
    await expect(page.locator('.phero .fact').first()).toContainText(area);
    await expect(page.locator('h1')).toHaveText(`Apartment ${n}`);
  }
  await page.goto('/en/residences.html');
  const table = await page.locator('.compare').innerText();
  for (const area of Object.values(expected)) expect(table).toContain(area);
  for (const old of ['4,065', '137 m', '144 m']) expect(await page.content()).not.toContain(old);
});

test('home page states the supplied project figures', async ({ page }) => {
  await page.goto('/en/index.html');
  await page.locator('#stats').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-count="2064"]')).toHaveText('2,064', { timeout: 6000 });
  await expect(page.locator('.stats-note')).toContainText('as supplied');
});
