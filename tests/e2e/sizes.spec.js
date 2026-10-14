// @ts-check
const { test, expect } = require('@playwright/test');

// src/sizes.json adjusts authored `sizes` hints from measurements. Invariants checked at many viewport widths:
//   1. no picture is hinted more than 1.3x narrower than it is drawn (it would be served a file one step too small);
//   2. above 1440 px an adjusted hint never claims more than 1.3x what the picture is drawn at (it would be served a larger
//      file than needed). Up to 1440 px authored over-claims are left as they are, so those screenshots stay unchanged.
// It guards the measurements against layout changes made later; regenerate with tools/audit_sizes.mjs + tools/apply_sizes.py.
const TOO_SMALL = 1.3, TOO_BIG = 1.3;
const fs = require('fs');
const path = require('path');
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'sizes.json'), 'utf8'));
const ADJUSTED = new Set(Object.entries(OVERRIDES).map(([key, value]) => key.split('|')[0] + '|' + value));

const PAGES = ['index', 'residences', 'gallery', 'project', 'architecture', 'lifestyle', 'location', 'compare', 'brochure', 'developer', 'residence-1'];
const WIDTHS = [360, 412, 600, 768, 900, 1024, 1180, 1366, 1500, 1700, 1920, 2200, 2560];

test.describe.configure({ timeout: 120_000 });
test.skip(({ browserName }) => browserName !== 'chromium', 'layout widths are checked in Chromium');

for (const lang of ['', 'en/']) {
  for (const name of PAGES) {
    test(`${lang}${name}: sizes never claim less than the drawn width`, async ({ page }) => {
      await page.goto(`/${lang}${name}.html`);
      await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
      const problems = [];
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(100);
        const res = await page.evaluate(([vw, adjusted]) => {
          const evalSizes = (sizes) => {
            if (!sizes) return vw;
            for (const raw of sizes.split(',')) {
              const part = raw.trim();
              const m = part.match(/^((?:\((?:min|max)-width:\s*\d+px\)\s*(?:and\s*)?)+)\s*(.+)$/);
              if (m) {
                const conds = [...m[1].matchAll(/\((min|max)-width:\s*(\d+)px\)/g)];
                if (!conds.every((c) => (c[1] === 'min' ? vw >= +c[2] : vw <= +c[2]))) continue;
                return len(m[2]);
              }
              return len(part);
            }
            return vw;
          };
          const len = (s) => (/vw$/.test(s) ? parseFloat(s) * vw / 100 : parseFloat(s));
          return [...document.querySelectorAll('img[srcset]')].map((img) => {
            const src = img.parentElement && img.parentElement.tagName === 'PICTURE' ? img.parentElement.querySelector('source[sizes]') : null;
            const sizes = (src && src.getAttribute('sizes')) || img.getAttribute('sizes') || '';
            let hidden = img.offsetWidth === 0;
            for (let e = img.parentElement; e && !hidden; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden') hidden = true; }
            const stem = (img.getAttribute('src') || '').split('/').pop().replace(/-\d+\.\w+$/, '');
            return { file: (img.getAttribute('src') || '').split('/').pop(), adjusted: adjusted.includes(stem + '|' + sizes), claimed: evalSizes(sizes), drawn: hidden ? 0 : img.offsetWidth };
          });
        }, [w, [...ADJUSTED]]);
        for (const r of res) {
          if (r.drawn <= 40) continue;
          if (r.claimed * TOO_SMALL < r.drawn) problems.push(`${r.file} @${w}px: hinted ${Math.round(r.claimed)}, drawn ${r.drawn} (too small)`);
          if (r.adjusted && w >= 1441 && r.claimed > r.drawn * TOO_BIG && r.claimed > 64) problems.push(`${r.file} @${w}px: hinted ${Math.round(r.claimed)}, drawn ${r.drawn} (too big)`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
}
