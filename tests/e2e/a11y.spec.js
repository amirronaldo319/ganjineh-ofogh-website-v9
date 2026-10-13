// @ts-check
// Automated accessibility audit (axe-core 4.10, vendored in tests/vendor) on every page, both languages, both themes.
// axe finds roughly a third of real-world issues; it does not replace a screen-reader pass.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const AXE = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'axe.min.js'), 'utf8');
const PAGES = ['index', 'project', 'architecture', 'residences', 'residence-1', 'residence-2', 'residence-3', 'residence-4', 'compare',
  'lifestyle', 'location', 'gallery', 'developer', 'brochure', 'contact', 'privacy', 'thank-you'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

for (const lang of ['fa', 'en']) {
  for (const theme of ['day', 'dusk']) {
    for (const name of PAGES) {
      test(`${lang} ${name} · ${theme}`, async ({ page, isMobile }) => {
        test.skip(isMobile && theme === 'dusk', 'desktop covers both themes; mobile covers day');
        await page.addInitScript((t) => { try { localStorage.setItem('ofogh-site-theme', t); } catch {} }, theme);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(`${lang === 'en' ? '/en' : ''}/${name}.html`);
        await page.waitForFunction(() => !!window.ofogh);
        await page.waitForTimeout(400);
        await page.evaluate(AXE);
        const result = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }), TAGS);
        const summary = result.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
        expect(summary, `${lang}/${name} ${theme}`).toEqual([]);
      });
    }
  }
}
