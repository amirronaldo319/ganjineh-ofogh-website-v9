// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('what the site says about what it does not know', () => {
  test('pictures are labelled with their kind, and the helipad is never presented as approved', async ({ page }) => {
    await page.goto('/en/index.html');
    await page.waitForFunction(() => !!window.ofogh);
    await expect(page.locator('.hero__art .kind')).toHaveText('Concept render; the helipad is not a permit');
    await page.goto('/en/gallery.html');
    const labels = await page.locator('.gal .kind').allInnerTexts();
    expect(labels.length).toBeGreaterThan(20);
    expect(new Set(labels)).toContain('Illustrative interior');
    expect(new Set(labels)).toContain('Concept cut-away, not to scale');
    await page.goto('/en/residence-2.html');
    await expect(page.locator('.phero__art .kind')).toHaveText('Concept cut-away, not to scale');
  });

  test('Persian labels are Persian', async ({ page }) => {
    await page.goto('/gallery.html');
    expect(await page.locator('.gal .kind').first().innerText()).toMatch(/[؀-ۿ]/);
  });

  test('every apartment page lists what is not published, says what the area includes, and flags the model match', async ({ page }) => {
    for (const n of [1, 2, 3, 4]) {
      await page.goto(`/en/residence-${n}.html`);
      const np = page.locator('.np');
      await expect(np).toContainText('Availability of each residence');
      await expect(np).toContainText('Delivery date');
      await expect(np).toContainText('Price and payment terms');
      await expect(np.locator('a.text-link')).toHaveAttribute('href', /contact\.html\?intent=consult/);
      await expect(page.locator('.phero')).toContainText('has not yet been confirmed');
      await expect(page.locator('#residences-3d')).toContainText('being confirmed against approved drawings');
      await expect(page.locator('#plan')).toContainText('A dimensioned plan with room sizes');
    }
  });

  test('the developer page does not claim more than it shows', async ({ page }) => {
    await page.goto('/en/developer.html');
    const text = (await page.locator('main').innerText()).toLowerCase();
    expect(text).not.toContain('documented record');
    expect(text).toContain('as documents are supplied');
    await page.goto('/en/index.html');
    expect((await page.locator('#dev-title').innerText())).toContain('a record from 1350 SH');
  });

  test('the tower model labels its floor count and height as assumed', async ({ page }) => {
    test.skip(!!process.env.NO_GPU, 'the tower viewer needs a real GPU; software WebGL on hosted CI is too slow');
    await page.goto('/tower-viewer/index.html?lang=en#nointro');
    await page.waitForFunction(() => document.querySelector('#status')?.classList.contains('gone'), null, { timeout: 80_000 });
    await expect(page.locator('body')).toContainText('(assumed)');
  });
});
