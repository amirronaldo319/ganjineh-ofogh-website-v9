// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AXE = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'axe.min.js'), 'utf8');

test.describe('motion layer III', () => {
  test.skip(({ isMobile }) => isMobile, 'pointer and wide-viewport behaviour');

  test('the header turns light-on-dark over dark bands and stays readable', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('ofogh-site-theme', 'day'); } catch {} });
    await page.goto('/index.html?intro=0');
    await page.waitForFunction(() => !!window.ofogh);
    const header = page.locator('#header');
    await expect(header).not.toHaveClass(/is-dark/);
    await page.locator('.visit').scrollIntoViewIfNeeded();
    await page.evaluate(() => { const v = document.querySelector('.visit'); window.scrollTo(0, v.getBoundingClientRect().top + window.scrollY + 40); });
    await expect(header).toHaveClass(/is-dark/);
    // let the colour transition finish before measuring contrast (axe would otherwise sample a mid-fade colour)
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.brand__name')).color + '|' + getComputedStyle(document.getElementById('header')).backgroundColor.slice(0, 18)),
      { timeout: 5000 }).toMatch(/^rgb\(237, 232, 220\)\|(rgba\(1\d|color\(srgb 0\.0)/);
    await page.waitForTimeout(150);
    await page.evaluate(AXE);
    const result = await page.evaluate(() => window.axe.run(document.getElementById('header'), { runOnly: ['color-contrast'], resultTypes: ['violations'] }));
    expect(result.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(', '))).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(header).not.toHaveClass(/is-dark/);
  });

  test('back-to-top appears after scrolling, shows progress, and returns to the top', async ({ page }) => {
    await page.goto('/en/project.html');
    await page.waitForFunction(() => !!window.ofogh);
    const top = page.locator('.totop');
    await expect(top).not.toHaveClass(/is-on/);
    await page.evaluate(() => window.scrollTo(0, 1800));
    await expect(top).toHaveClass(/is-on/);
    expect(await top.evaluate((el) => parseFloat(el.style.getPropertyValue('--read')))).toBeGreaterThan(0.05);
    await expect(top).toHaveAttribute('aria-label', 'Back to top');
    await top.click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 }).toBeLessThan(5);
  });

  test('compare columns re-arrive when the pair changes', async ({ page }) => {
    await page.goto('/en/compare.html');
    await expect(page.locator('#cmp')).toHaveClass(/is-swap/);
    await page.locator('#cmp-b').selectOption('3');
    await expect(page.locator('#cmp')).toHaveClass(/is-swap/);
    await expect(page.locator('#cmp-diff')).toHaveClass(/is-new/);
  });

  test('reduced motion turns the new animations off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/index.html');
    await page.waitForFunction(() => !!window.ofogh);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.hero'), '::after').animationName)).toBe('none');
    expect(await page.evaluate(() => document.querySelectorAll('.totop').length)).toBe(0);   // the motion script does not run at all
  });
});
