// @ts-check
const { test, expect } = require('@playwright/test');

test('mobile menu: opens from the button, Escape closes and returns focus', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The menu toggle is shown below the desktop breakpoint');
  await page.goto('/residences.html');
  await page.waitForFunction(() => !!window.ofogh);

  const toggle = page.locator('#menu-btn');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#menu')).toHaveClass(/open/);
  await expect(page.locator('#menu a[href="residences.html"]')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('desktop navigation marks the current section', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop navigation only');
  await page.goto('/lifestyle.html');
  await expect(page.locator('.nav a[aria-current="page"]')).toHaveAttribute('href', 'lifestyle.html');
  await page.goto('/en/residence-3.html');
  await expect(page.locator('.nav a[aria-current="page"]')).toHaveAttribute('href', 'residences.html');
});

test('landing on a #hash far down the page keeps the header reachable', async ({ page }) => {
  await page.goto('/en/residence-2.html#plan');
  await page.waitForFunction(() => !!window.ofogh);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(480);
  await expect(page.locator('#header')).not.toHaveClass(/is-hidden/);
  await expect(page.locator('#lang-btn')).toBeInViewport();
});
