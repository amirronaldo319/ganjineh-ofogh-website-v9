// Renders every <img> on every page at several viewports from two servers and saves element screenshots for the images
// whose chosen file differs. Used to check that a new srcset rung looks the same as the file it replaces.
//   node tools/compare_img_render.mjs http://127.0.0.1:8901 http://127.0.0.1:8902 /tmp/imgcmp
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [A, B, OUT = '/tmp/imgcmp'] = process.argv.slice(2);
const PAGES = ['index', 'residences', 'gallery', 'project', 'architecture', 'lifestyle', 'location', 'compare', 'brochure', 'developer', 'residence-1', 'residence-2'];
const ONLY = (process.env.VPS || '').split(',').filter(Boolean);
const VPS = [
  { n: 'p360x3', width: 360, height: 740, dpr: 3 },
  { n: 't768x2', width: 768, height: 1024, dpr: 2 },
  { n: 'l1440x2', width: 1440, height: 900, dpr: 2 },
  { n: 'd1920x1', width: 1920, height: 1080, dpr: 1 },
].filter((v) => !ONLY.length || ONLY.includes(v.n));
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const stem = (u) => u.split('/').pop();

async function collect(base, vp, pg) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const r = await page.goto(`${base}/${pg}.html`, { waitUntil: 'load' }).catch(() => null);
  if (!r || r.status() !== 200) { await ctx.close(); return null; }
  await page.addStyleTag({ content: '*{scroll-behavior:auto!important;animation:none!important;transition:none!important}' });
  await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } scrollTo(0, 0); });
  await page.waitForTimeout(600);
  const list = await page.evaluate(() => [...document.images].map((i, k) => ({ k, src: i.currentSrc, ok: i.complete && i.naturalWidth > 0, vis: i.clientWidth > 8 && i.clientHeight > 8 && getComputedStyle(i).visibility !== 'hidden' })));
  return { ctx, page, list };
}

const report = [];
for (const vp of VPS) for (const pg of PAGES) {
  const a = await collect(A, vp, pg), b = await collect(B, vp, pg);
  if (!a || !b) { await a?.ctx.close(); await b?.ctx.close(); continue; }
  const n = Math.min(a.list.length, b.list.length);
  for (let k = 0; k < n; k++) {
    const x = a.list[k], y = b.list[k];
    if (!x.ok || !y.ok || !x.vis || stem(x.src) === stem(y.src)) continue;
    const key = `${vp.n}__${pg}__${k}`;
    fs.mkdirSync(path.join(OUT, 'A'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'B'), { recursive: true });
    try {
      for (const [side, s] of [['A', a], ['B', b]]) {
        const h = (await s.page.$$('img'))[k];
        await h.scrollIntoViewIfNeeded(); await s.page.waitForTimeout(120);
        await h.screenshot({ path: path.join(OUT, side, key + '.png'), animations: 'disabled' });
      }
      report.push({ key, vp: vp.n, page: pg, from: stem(x.src), to: stem(y.src) });
    } catch (e) { /* element not screenshot-able (hidden/offscreen clip) */ }
  }
  await a.ctx.close(); await b.ctx.close();
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log('changed-image comparisons:', report.length);
await browser.close();
