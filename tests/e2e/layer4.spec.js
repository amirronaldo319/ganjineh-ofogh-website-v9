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

test.describe('motion layer V', () => {
  test('apartment pictures carry shared-element names so they morph between a card and its page', async ({ page }) => {
    await page.goto('/en/residences.html');
    const names = await page.evaluate(() => [...document.querySelectorAll('a.apt-card')].map((a) => [a.getAttribute('href'), getComputedStyle(a.querySelector('.frame')).viewTransitionName]));
    expect(names).toEqual([['residence-1.html', 'apt-1'], ['residence-2.html', 'apt-2'], ['residence-3.html', 'apt-3'], ['residence-4.html', 'apt-4']]);
    await page.goto('/en/residence-3.html');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.phero__art .arch')).viewTransitionName)).toBe('apt-3');
    // the other three cards on the page use their own names, so no name appears twice
    const others = await page.evaluate(() => [...document.querySelectorAll('a.apt-card .frame')].map((f) => getComputedStyle(f).viewTransitionName));
    expect(new Set(others).size).toBe(others.length);
    expect(others).not.toContain('apt-3');
  });

  test('area bars show relative size, longest for the largest apartment', async ({ page }) => {
    await page.goto('/en/residences.html');
    const widths = await page.evaluate(() => [...document.querySelectorAll('.areabar')].map((b) => parseFloat(getComputedStyle(b).getPropertyValue('--w'))));
    expect(widths).toHaveLength(4);
    expect(widths[2]).toBeCloseTo(100, 0);                 // 166 m², the largest
    expect(widths[0]).toBeCloseTo(86.3, 0);                // 143.25 / 166
    expect(Math.max(...widths)).toBe(widths[2]);
  });

  test('the call-to-action band takes the arch shape and the hero leaves with the scroll', async ({ page, isMobile }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => !!window.ofogh);
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.visit')).borderStartStartRadius))).toBeGreaterThan(30);
    if (!isMobile) {
      const name = await page.evaluate(() => getComputedStyle(document.querySelector('.hero__copy')).animationName);
      expect(['heroExitCopy', 'none']).toContain(name);   // none where scroll-driven animations are unsupported
    }
  });
});
