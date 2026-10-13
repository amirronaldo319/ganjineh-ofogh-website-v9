// @ts-check
const { test, expect } = require('@playwright/test');

const WIDTHS = [320, 768, 1024, 1440];
const THEMES = ['day', 'dusk'];
const PAGES = ['index', 'project', 'architecture', 'residences', 'residence-1', 'residence-2', 'residence-3', 'residence-4',
  'lifestyle', 'location', 'gallery', 'developer', 'contact', 'brochure', 'compare', 'privacy'];
// English is the same templates; sample the pages where text length changes the layout most.
const ENGLISH = ['index', 'residences', 'residence-2', 'contact'];
const MAX_HEIGHT = 12_000;           // Chrome cannot capture much beyond 16k px; the top 12k px is where design lives

async function settle(page) {
  await page.evaluate(async () => {
    const step = Math.round(innerHeight * 0.8);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 70)); }
    scrollTo(0, 0);
    // only images that take part in the layout: a lazy image inside a hidden column never loads, and must not be waited for
    const shown = [...document.images].filter((i) => i.getClientRects().length > 0);
    await Promise.race([Promise.all(shown.map((i) => (i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; })))), new Promise((r) => setTimeout(r, 8000))]);
    await document.fonts.ready;
  });
  await page.waitForTimeout(350);
}

async function shoot(page, name, url, theme, width) {
  await page.addInitScript((t) => { try { localStorage.setItem('ofogh-site-theme', t); } catch {} }, theme);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.ofogh);
  await settle(page);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, clip: undefined, maxDiffPixels: 2500, ...(height > MAX_HEIGHT ? { clip: { x: 0, y: 0, width, height: MAX_HEIGHT } } : {}) });
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    for (const name of PAGES) {
      test(`fa ${name} · ${width}px · ${theme}`, async ({ page }) => {
        await shoot(page, `fa-${name}-${width}-${theme}`, `/${name}.html`, theme, width);
      });
    }
    for (const name of ENGLISH) {
      test(`en ${name} · ${width}px · ${theme}`, async ({ page }) => {
        await shoot(page, `en-${name}-${width}-${theme}`, `/en/${name}.html`, theme, width);
      });
    }
  }
}
