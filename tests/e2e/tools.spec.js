// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('compare two apartments', () => {
  test('shows two columns, says how they differ, and keeps the choice in the address', async ({ page }) => {
    await page.goto('/en/compare.html');
    const visible = () => page.locator('#cmp-table thead th[data-apt]:not([hidden])');
    await expect(visible()).toHaveCount(2);
    await expect(page.locator('#cmp-diff')).toHaveText('Apartment 2 is 6.75 m² (4.7%) larger than Apartment 1.');

    await page.locator('#cmp-b').selectOption('3');
    await expect(page.locator('#cmp-diff')).toHaveText('Apartment 3 is 22.75 m² (15.9%) larger than Apartment 1.');
    await expect(page).toHaveURL(/[?&]a=1&b=3/);
    await expect(page.locator('#cmp-table td.num[data-area="166"]')).toBeVisible();
    await expect(page.locator('#cmp-table td[data-area="150"]')).toBeHidden();

    await page.locator('#cmp-b').selectOption('1');
    await expect(page.locator('#cmp-diff')).toContainText('same apartment twice');
  });

  test('a shared link restores the pair; Persian uses Persian digits', async ({ page }) => {
    await page.goto('/compare.html?a=4&b=2');
    await expect(page.locator('#cmp-a')).toHaveValue('4');
    await expect(page.locator('#cmp-b')).toHaveValue('2');
    await expect(page.locator('#cmp-diff')).toHaveText('واحد ۴ ۱۲ متر مربع (۸٪) از واحد ۲ بزرگ‌تر است.');
  });

  test('every apartment links to its own page, and no unsupplied facts are shown', async ({ page }) => {
    await page.goto('/en/compare.html');
    const links = await page.locator('#cmp-table a[href^="residence-"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
    expect(links.sort()).toEqual(['residence-1.html', 'residence-2.html', 'residence-3.html', 'residence-4.html']);
    const text = await page.locator('#cmp').innerText();
    expect(text).not.toMatch(/north|south|east|west|view of|floor \d/i);
    expect(text).toContain('not yet part of the supplied information');
  });
});
