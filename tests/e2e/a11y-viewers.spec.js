// @ts-check
// Accessibility of the two 3D viewers (they are framed inside pages, so the page-level axe run never reaches them):
// automated axe checks plus the keyboard behaviours a screen-reader or keyboard-only visitor depends on.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

test.describe.configure({ timeout: 120_000 });
test.skip(({ browserName }) => browserName !== 'chromium', 'checked in Chromium');

const AXE = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const VIEWERS = [
  { name: 'tower', url: (lang) => `/tower-viewer/index.html?lang=${lang}#nointro`, ready: '#status.gone' },
  { name: 'apartment', url: (lang) => `/residences-3d/index.html?apt=2&lang=${lang}`, ready: '#loading[hidden]' },
];

for (const v of VIEWERS) {
  for (const lang of ['en', 'fa']) {
    test(`${v.name} viewer · ${lang}: axe finds no violations`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(v.url(lang));
      await page.waitForSelector(v.ready, { state: 'attached', timeout: 60_000 });
      await page.waitForTimeout(600);
      await page.evaluate(AXE);
      const result = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }), TAGS);
      const summary = result.violations.map((x) => `${x.id} (${x.impact}) ×${x.nodes.length}: ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(summary).toEqual([]);
    });

    test(`${v.name} viewer · ${lang}: every control has a name, the canvas is described, Tab reaches the controls`, async ({ page }) => {
      test.skip(v.name === 'tower' && !!process.env.NO_GPU, 'the tower viewer needs a real GPU; software WebGL on hosted CI is too slow');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(v.url(lang));
      await page.waitForSelector(v.ready, { state: 'attached', timeout: 60_000 });
      await page.waitForTimeout(600);
      const report = await page.evaluate(() => {
        const unnamed = [...document.querySelectorAll('button, [role="button"], input, select, a[href]')]
          .filter((e) => e.offsetParent !== null || e === document.activeElement)
          .filter((e) => !((e.getAttribute('aria-label') || '').trim() || (e.textContent || '').trim() || (e.getAttribute('title') || '').trim() ||
                           (e.labels && e.labels.length) || e.getAttribute('aria-labelledby')))
          .map((e) => e.outerHTML.slice(0, 80));
        const canvas = document.querySelector('canvas');
        const label = canvas && (canvas.getAttribute('aria-label') || canvas.getAttribute('aria-labelledby') || canvas.getAttribute('title') || (canvas.closest('[aria-label]') || {}).ariaLabel);
        return { unnamed, canvas: !!canvas, canvasLabelled: !!label || !!(canvas && canvas.getAttribute('role')) };
      });
      expect(report.unnamed).toEqual([]);
      expect(report.canvas).toBe(true);
      expect(report.canvasLabelled, 'the canvas needs a role or a label so it is not announced as an unnamed graphic').toBe(true);

      // Tab reaches at least five distinct, visible controls and each shows a focus indicator
      const seen = new Set();
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const e = document.activeElement;
          if (!e || e === document.body) return null;
          const cs = getComputedStyle(e);
          const outlined = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
          return { id: e.id || e.getAttribute('data-view') || e.getAttribute('data-light') || e.textContent.trim().slice(0, 20), outlined };
        });
        if (info) seen.add(JSON.stringify(info));
      }
      const items = [...seen].map((s) => JSON.parse(s));
      expect(items.length).toBeGreaterThanOrEqual(5);
      expect(items.filter((i) => !i.outlined).map((i) => i.id), 'controls with no visible focus indicator').toEqual([]);
    });
  }
}
