// For every responsive image, compares what its `sizes` attribute claims with the width it is actually drawn at,
// across viewport widths. Output feeds tools/apply_sizes.py.
//   PW_CHANNEL=chrome node tools/audit_sizes.mjs http://127.0.0.1:8902 /tmp/sizes_audit.json
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:8902';
const out = process.argv[3] || '/tmp/sizes_audit.json';
const PAGES = ['index', 'residences', 'gallery', 'project', 'architecture', 'lifestyle', 'location', 'compare', 'brochure', 'contact', 'faq', 'developer', 'residence-1', 'residence-2', 'residence-3', 'residence-4'];
// Dense below 1100 px, where grids reflow; layout breakpoints are sharp, so a 16 px step pins them down to the pixel row.
const WIDTHS = [];
for (let w = 320; w < 1100; w += 16) WIDTHS.push(w);
for (let w = 1100; w < 1920; w += 40) WIDTHS.push(w);
for (const w of [1920, 2000, 2200, 2400, 2560]) WIDTHS.push(w);

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const rows = [];
for (const lang of ['', 'en/']) {
  for (const pg of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const r = await page.goto(`${base}/${lang}${pg}.html`, { waitUntil: 'load' }).catch(() => null);
    if (!r || r.status() !== 200) { await ctx.close(); continue; }
    await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
    const items = [];
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(120);
      const m = await page.evaluate(() => [...document.querySelectorAll('img[srcset]')].map((img, i) => {
        const s = img.parentElement && img.parentElement.tagName === 'PICTURE' ? img.parentElement.querySelector('source[sizes]') : null;
        const sizes = (s && s.getAttribute('sizes')) || img.getAttribute('sizes') || '';
        const cs = getComputedStyle(img);
        let hidden = cs.display === 'none' || img.offsetWidth === 0;
        for (let e = img.parentElement; e && !hidden; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden') hidden = true; }
        const stem = (img.getAttribute('src') || '').split('/').pop().replace(/-\d+\.\w+$/, '');
        return { i, stem, sizes, w: hidden ? null : img.offsetWidth };
      }));
      items.push(m);
    }
    const n = items[0].length;
    for (let i = 0; i < n; i++) {
      const first = items[0][i];
      rows.push({ page: lang + pg, stem: first.stem, sizes: first.sizes, widths: WIDTHS.map((w, k) => (items[k][i] ? items[k][i].w : null)) });
    }
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(out, JSON.stringify({ WIDTHS, rows }, null, 1));
console.log('images measured:', rows.length, '→', out);
