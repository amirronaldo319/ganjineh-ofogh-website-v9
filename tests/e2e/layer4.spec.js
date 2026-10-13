// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('motion layer IV · desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop pointer behaviour');

  test('dusk shows stars in the hero, day does not', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('ofogh-site-theme', 'dusk'); } catch {} });
    await page.goto('/index.html');
    await page.waitForFunction(() => !!window.ofogh);
    await expect(page.locator('.hero .stars i').first()).toBeAttached();
    expect(await page.locator('.hero .stars i').count()).toBeGreaterThan(10);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'day'));
    await expect(page.locator('.hero .stars')).toHaveCount(0);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dusk'));
    await expect(page.locator('.hero .stars')).toHaveCount(1);
  });

  test('the dark call-to-action band has drifting specks, hidden from assistive technology', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => !!window.ofogh);
    await expect(page.locator('.visit .motes')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.locator('.visit .motes i').count()).toBeGreaterThanOrEqual(8);
  });

  test('buttons ripple from the point of contact and clean up after themselves', async ({ page }) => {
    await page.goto('/en/contact.html');
    await page.waitForFunction(() => !!window.ofogh);
    const btn = page.locator('.cta-row .btn, .btn').first();
    await btn.dispatchEvent('pointerdown', { clientX: 40, clientY: 20, bubbles: true });
    await expect(btn.locator('.ripple')).toHaveCount(1);
    await expect(btn.locator('.ripple')).toHaveCount(0, { timeout: 3000 });
  });

  test('the hero image is framed by crop marks and the wordmark has a running gleam', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => !!window.ofogh);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.hero__art'), '::before').content)).not.toBe('none');
    const gleams = await page.evaluate(() => document.querySelector('.hero__title .en').getAnimations().filter((a) => a.effect && a.effect.getKeyframes().some((k) => 'backgroundPosition' in k)).length);
    expect(gleams).toBe(1);
  });

  test('plan pins breathe until one is chosen', async ({ page }) => {
    await page.goto('/en/residences.html');
    await page.waitForFunction(() => !!window.ofogh);
    const name = await page.evaluate(() => getComputedStyle(document.querySelector('.pin[aria-pressed="false"]'), '::before').animationName);
    expect(name).toBe('pinBreath');
    const pressed = await page.evaluate(() => getComputedStyle(document.querySelector('.pin[aria-pressed="true"]'), '::before').animationName);
    expect(pressed).toBe('none');
  });
});

test.describe('motion layer IV · phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone-only sales bar');

  test('the sales bar arrives after reading, carries the apartment, and leaves before the footer', async ({ page }) => {
    await page.goto('/en/residence-3.html');
    await page.waitForFunction(() => !!window.ofogh);
    const bar = page.locator('.stickycta');
    await expect(bar).not.toHaveClass(/is-on/);
    await page.evaluate(() => window.scrollTo(0, 1400));
    await expect(bar).toHaveClass(/is-on/);
    await expect(bar.locator('a').first()).toHaveAttribute('href', /unit=residence-3#appointment/);
    await expect(bar.locator('a').nth(1)).toHaveAttribute('href', /brochure\.html\?unit=residence-3/);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(bar).not.toHaveClass(/is-on/);
  });

  test('the brochure form pre-selects the apartment from the sales bar', async ({ page }) => {
    await page.goto('/en/brochure.html?unit=residence-4');
    await expect(page.locator('#residence-interest')).toHaveValue('residence-4');
  });
});
