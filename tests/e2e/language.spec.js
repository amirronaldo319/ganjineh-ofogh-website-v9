// @ts-check
const { test, expect } = require('@playwright/test');

test('the language switch goes to the counterpart page, keeps query and hash, and the choice persists', async ({ page }) => {
  await page.goto('/residence-2.html?utm_source=x#plan');
  await page.waitForFunction(() => !!window.ofogh);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');

  await page.locator('#lang-btn').click();
  await expect(page).toHaveURL(/\/en\/residence-2\.html\?utm_source=x#plan$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toHaveText('Apartment 2');
  await expect(page.locator('#lang-btn')).toHaveText('فا');

  // A visitor who chose English is sent to English when opening a Persian URL.
  await page.goto('/project.html');
  await expect(page).toHaveURL(/\/en\/project\.html$/);

  await page.locator('#lang-btn').click();
  await expect(page).toHaveURL(/\/project\.html$/);
  await page.goto('/location.html');
  await expect(page).toHaveURL(/\/location\.html$/);
});

test('theme persists across pages and languages', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/en/index.html');
  await page.waitForFunction(() => !!window.ofogh);
  await page.locator('#theme-btn').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dusk');
  await page.goto('/location.html');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dusk');
});

test('titles and descriptions are per language', async ({ page }) => {
  await page.goto('/residences.html');
  await expect(page).toHaveTitle(/واحدها/);
  await page.goto('/en/residences.html');
  await expect(page).toHaveTitle(/Residences/);
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /three-bedroom/);
});
