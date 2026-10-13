// @ts-check
const { test, expect } = require('@playwright/test');

test('category filter hides other categories and is reflected in the URL', async ({ page }) => {
  await page.goto('/en/gallery.html');
  const total = await page.locator('.gal figure').count();
  await page.locator('.filter[data-cat="amenities"]').click();
  await expect(page.locator('.gal figure:not([hidden])')).toHaveCount(5);
  await expect(page).toHaveURL(/cat=amenities/);
  await page.locator('.filter[data-cat="all"]').click();
  await expect(page.locator('.gal figure:not([hidden])')).toHaveCount(total);
});

test('?photo= opens that image in the lightbox; arrows navigate; Escape closes', async ({ page }) => {
  await page.goto('/en/gallery.html?photo=kitchen');
  await expect(page.locator('#lb')).toHaveAttribute('open', '');
  await expect(page.locator('#lb-img')).toHaveAttribute('alt', /kitchen with a central island/i);
  const first = await page.locator('#lb-img').getAttribute('src');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.locator('#lb-img').getAttribute('src')).not.toBe(first);
  await page.keyboard.press('Escape');
  await expect(page.locator('#lb')).not.toHaveAttribute('open', '');
});

test('?cat= preselects the category', async ({ page }) => {
  await page.goto('/en/gallery.html?cat=plans');
  await expect(page.locator('.filter[data-cat="plans"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.gal figure:not([hidden])')).toHaveCount(5);
});
