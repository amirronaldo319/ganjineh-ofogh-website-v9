// Replays the same interactions in the tower viewer on two servers and compares settled screenshots, then counts GL draw
// calls while the viewer sits idle. Draw-on-demand must give identical pictures with far fewer draws.
//   PW_CHANNEL=chrome node tools/verify_tower_ondemand.mjs http://127.0.0.1:8901 http://127.0.0.1:8902
import { chromium } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';

const [A, B] = process.argv.slice(2);
const LABELS = process.env.AA ? [['A1', A], ['A2', A]] : [['A', A], ['B', B]];
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const sha = (b) => crypto.createHash('sha1').update(b).digest('hex').slice(0, 12);

async function run(base, label, vp = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__draws = 0;
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!C) continue;
      for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
        const orig = C.prototype[fn]; if (!orig) continue;
        C.prototype[fn] = function () { window.__draws++; return orig.apply(this, arguments); };
      }
    }
  });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/tower-viewer/index.html#nointro`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#status')?.classList.contains('gone') || !document.querySelector('#status'), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(9000);
  const shots = {};
  const snap = async (name, wait = 2200) => { await page.waitForTimeout(wait); const buf = await page.screenshot(); shots[name] = sha(buf); if (process.env.DUMP) fs.writeFileSync(`${process.env.DUMP}/${label}_${name}.png`, buf); };
  const draws = () => page.evaluate(() => window.__draws);
  await snap('loaded', 1500);
  const d0 = await draws(); await page.waitForTimeout(4000); const idleDraws = (await draws()) - d0;
  await page.click('[data-view="street"]'); await snap('street', 3800);
  await page.click('[data-view="back"]'); await snap('back', 3800);
  await page.click('[data-view="corner"]'); await snap('corner', 3800);
  await page.click('[data-tab="light"]').catch(() => {});
  await page.click('[data-light="night"]'); await snap('night', 2600);
  await page.click('[data-light="golden"]'); await snap('golden', 2600);
  await page.click('[data-light="day"]'); await snap('day', 2600);
  const cx = vp.width / 2, cy = vp.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 220, cy + 60, { steps: 14 }); await page.mouse.up(); await snap('dragged', 2500);
  await page.mouse.wheel(0, -500); await snap('zoomed', 2000);
  await page.click('[data-tab="floors"]').catch(() => {}); await snap('floors', 3500);
  await page.click('[data-tab="view"]').catch(() => {}); await page.click('[data-view="roof"]'); await snap('roof', 3800);
  await page.keyboard.press('ArrowLeft'); await snap('key-left', 1500);
  // interrupted / rapid interactions
  await page.click('[data-tab="view"]').catch(() => {});
  await page.click('[data-view="street"]'); await page.waitForTimeout(250); await page.click('[data-view="plan"]'); await page.waitForTimeout(300);
  await page.click('[data-view="back"]'); await snap('rapid-views', 4200);
  await page.click('[data-tab="light"]').catch(() => {});
  await page.click('[data-light="night"]'); await page.waitForTimeout(400); await page.click('[data-light="day"]'); await snap('rapid-light', 3000);
  await page.focus('#tod'); for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight'); await snap('tod-slider', 2500);
  // host messages (theme + language) as the site sends them
  await page.evaluate(() => window.postMessage({ src: 'ofogh-site', light: 'night' }, '*')); await snap('msg-night', 3000);
  await page.evaluate(() => window.postMessage({ src: 'ofogh-site', lang: 'en' }, '*')); await snap('msg-lang', 1500);
  // guided tour
  await page.click('#tour-btn').catch(() => {}); await snap('tour-start', 4500);
  await page.click('#tour-next').catch(() => {}); await snap('tour-next', 4500);
  await page.click('#tour-close').catch(() => {}); await snap('tour-stop', 3500);
  // auto-rotate on, then off
  await page.click('[data-tab="more"]').catch(() => {}); await page.click('#t-rotate').catch(() => {}); await page.waitForTimeout(1500); await page.click('#t-rotate').catch(() => {}); await snap('rotate-off', 2500);
  // resize
  await page.setViewportSize({ width: 800, height: 900 }); await snap('resized', 2500);
  const s0 = await draws(); await page.waitForTimeout(3000); const idleAfter = (await draws()) - s0;
  const m = await page.evaluate(() => 1);
  await ctx.close();
  return { label, shots, idleDraws, idleAfter, errors };
}

const out = [];
for (const [label, base] of LABELS) out.push(await run(base, label));
await browser.close();
const [a, b] = out;
let same = 0, total = 0;
for (const k of Object.keys(a.shots)) { total++; const eq = a.shots[k] === b.shots[k]; if (eq) same++; console.log(k.padEnd(10), eq ? 'IDENTICAL' : `DIFF  A ${a.shots[k]}  B ${b.shots[k]}`); }
console.log(`\nsettled screenshots identical: ${same}/${total}`);
console.log(`draw calls over 4 s idle after load : A ${a.idleDraws}  B ${b.idleDraws}`);
console.log(`draw calls over 3 s idle after use  : A ${a.idleAfter}  B ${b.idleAfter}`);
console.log('page errors  A', a.errors.length, ' B', b.errors.length);
fs.writeFileSync('/tmp/claude-501/tower_ondemand.json', JSON.stringify(out, null, 1));
