// Image + font audit: for every page, language and viewport/DPR, compares each image's decoded size with the size it is
// actually drawn at, and lists which font files the browser downloaded.
//   PW_CHANNEL=chrome node tools/audit_images_fonts.mjs http://127.0.0.1:8902 [out.json]
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:8902';
const out = process.argv[3] || '/tmp/image_font_audit.json';
const PAGES = ['index', 'residences', 'gallery', 'project', 'architecture', 'lifestyle', 'location', 'compare', 'brochure', 'contact', 'faq', 'developer'];
const VIEWPORTS = [
  { name: 'phone-360@3', width: 360, height: 740, dpr: 3 },
  { name: 'phone-412@2.6', width: 412, height: 915, dpr: 2.6 },
  { name: 'tablet-768@2', width: 768, height: 1024, dpr: 2 },
  { name: 'laptop-1440@1', width: 1440, height: 900, dpr: 1 },
  { name: 'laptop-1440@2', width: 1440, height: 900, dpr: 2 },
  { name: 'desktop-1920@1', width: 1920, height: 1080, dpr: 1 },
];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const rows = [];
const fonts = {};
for (const vp of VIEWPORTS) {
  for (const lang of ['', 'en/']) {
    for (const pg of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const url = `${base}/${lang}${pg}.html`;
      const resp = await page.goto(url, { waitUntil: 'load' }).catch(() => null);
      if (!resp || resp.status() !== 200) { await ctx.close(); continue; }
      await page.addStyleTag({ content: '*{scroll-behavior:auto!important}' });
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < h; y += vp.height * 0.8) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(60); }
      await page.waitForTimeout(500);
      const imgs = await page.evaluate(() => [...document.images].filter((i) => i.currentSrc && i.naturalWidth && i.clientWidth > 2).map((i) => {
        const r = i.getBoundingClientRect(); const cs = getComputedStyle(i);
        const rt = performance.getEntriesByName(i.currentSrc)[0];
        return { src: i.currentSrc, nw: i.naturalWidth, nh: i.naturalHeight, cw: r.width, ch: r.height, fit: cs.objectFit, bytes: rt ? (rt.encodedBodySize || rt.transferSize || 0) : 0 };
      }));
      for (const i of imgs) rows.push({ vp: vp.name, page: lang + pg, ...i, need: i.cw * vp.dpr, ratio: i.nw / (i.cw * vp.dpr) });
      const f = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /\.woff2?$/.test(e.name)).map((e) => [e.name.split('/').pop(), e.encodedBodySize]));
      for (const [n, b] of f) (fonts[`${vp.name} ${lang}${pg}`] ||= []).push(`${n} ${b}`);
      await ctx.close();
    }
  }
}
await browser.close();
fs.writeFileSync(out, JSON.stringify({ rows, fonts }, null, 1));
console.log('images measured:', rows.length, '→', out);
