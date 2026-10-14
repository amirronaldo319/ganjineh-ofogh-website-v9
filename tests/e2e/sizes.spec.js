// @ts-check
const { test, expect } = require('@playwright/test');

// src/sizes.json tightens authored `sizes` hints from measurements. The invariant: a tightened hint never claims less than
// the image is drawn at, unless the authored hint already claimed less (a pre-existing shortfall, reported separately).
// It also guards the measurements against layout changes made later.
const fs = require('fs');
const path = require('path');
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'sizes.json'), 'utf8'));
const AUTHORED = {};                       // "<stem>|<tightened>" -> authored hint
for (const [key, tightened] of Object.entries(OVERRIDES)) AUTHORED[key.split('|')[0] + '|' + tightened] = key.split('|').slice(1).join('|');
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
        const res = await page.evaluate(([vw, authored]) => {
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
            const old = authored[stem + '|' + sizes];
            return { file: (img.getAttribute('src') || '').split('/').pop(), tightened: old !== undefined, claimed: evalSizes(sizes), before: old !== undefined ? evalSizes(old) : null, drawn: hidden ? 0 : img.offsetWidth };
          });
        }, [w, AUTHORED]);
        for (const r of res) if (r.tightened && r.drawn > 40 && r.claimed < Math.min(r.before, r.drawn * 0.97)) problems.push(`${r.file} @${w}px: now claims ${Math.round(r.claimed)}, was ${Math.round(r.before)}, drawn ${r.drawn}`);
        for (const r of res) if (r.tightened && r.claimed > r.before + 1) problems.push(`${r.file} @${w}px: claim grew from ${Math.round(r.before)} to ${Math.round(r.claimed)}`);
      }
      expect(problems).toEqual([]);
    });
  }
}
