// A/B performance harness: the same scenarios against two builds under identical, throttled conditions.
//
//   node tools/perf_ab.mjs http://127.0.0.1:8901 http://127.0.0.1:8902 [runs]
//
// Runs are interleaved (A, B, A, B …) so machine drift hits both equally. Reports medians and spread. Browser: installed Chrome,
// CPU throttled 4× (a mid-range phone), network 9 Mbps / 150 ms for cold loads. Laboratory numbers only: they say which build
// does less work under the same conditions, not how a real phone feels.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const [A, B, RUNS = '5'] = process.argv.slice(2);
const runs = Number(RUNS);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const spread = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? `${s[0].toFixed(0)}–${s[s.length - 1].toFixed(0)}` : ''; };

async function session(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 412, height: 915 }, deviceScaleFactor: 1, ...opts.ctx });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.cpu ?? 4 });
  await cdp.send('Performance.enable');
  return { ctx, page, cdp };
}
const metrics = async (cdp) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const diff = (a, b) => ({
  script: (b.ScriptDuration - a.ScriptDuration) * 1000, layout: (b.LayoutDuration - a.LayoutDuration) * 1000,
  style: (b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000, task: (b.TaskDuration - a.TaskDuration) * 1000,
  layouts: b.LayoutCount - a.LayoutCount, recalcs: b.RecalcStyleCount - a.RecalcStyleCount,
});

// ── S1: cold load ──
async function coldLoad(browser, base, path) {
  const { ctx, page, cdp } = await session(browser);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 9 * 1024 * 1024 / 8, uploadThroughput: 3 * 1024 * 1024 / 8 });
  const reqs = [];
  page.on('response', (r) => { const l = r.headers()['content-length']; reqs.push({ url: r.url(), status: r.status(), len: Number(l || 0), enc: r.headers()['content-encoding'] || '' }); });
  await page.addInitScript(() => {
    window.__m = { lt: [], cls: 0, lcp: 0, fcp: 0 };
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__m.lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__m.cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__m.lcp = e.startTime; })).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime; })).observe({ type: 'paint', buffered: true });
  });
  const m0 = await metrics(cdp);
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const m1 = await metrics(cdp);
  const r = await page.evaluate(() => ({ ...window.__m, nav: performance.getEntriesByType('navigation')[0].toJSON() }));
  await ctx.close();
  const tbt = r.lt.reduce((s, [st, d]) => s + (st > r.fcp ? Math.max(0, d - 50) : 0), 0);
  const imgs = reqs.filter((q) => /\.(avif|webp|jpg|png)(\?|$)/.test(q.url));
  const stems = {};
  imgs.forEach((q) => { const k = q.url.split('/').pop().replace(/-\d+\.(avif|webp|jpg|png).*/, ''); (stems[k] = stems[k] || []).push(q.url.split('/').pop()); });
  const dupes = Object.values(stems).filter((v) => v.length > 1).length;
  const d = diff(m0, m1);
  return { fcp: r.fcp, lcp: r.lcp, cls: r.cls, tbt, dcl: r.nav.domContentLoadedEventEnd, load: r.nav.loadEventEnd, requests: reqs.length,
    bytes: reqs.reduce((s, q) => s + q.len, 0) / 1024, imgBytes: imgs.reduce((s, q) => s + q.len, 0) / 1024, dupes, ...d };
}

// ── S2: scroll the whole page at a fixed step per frame ──
async function scrollRun(browser, base, path) {
  const { ctx, page, cdp } = await session(browser);
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  const m0 = await metrics(cdp);
  const r = await page.evaluate(() => new Promise((resolve) => {
    const total = document.documentElement.scrollHeight - innerHeight, step = 36, deltas = [];
    let y = 0, last = performance.now();
    (function tick(now) {
      deltas.push(now - last); last = now;
      y += step; window.scrollTo(0, y);
      if (y < total) requestAnimationFrame(tick); else resolve({ deltas, frames: deltas.length });
    })(performance.now());
  }));
  const m1 = await metrics(cdp);
  await ctx.close();
  const d = r.deltas.slice(2);
  const sorted = [...d].sort((a, b) => a - b);
  const d0 = diff(m0, m1);
  return { frames: r.frames, p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)], worst: sorted[sorted.length - 1],
    over25: d.filter((x) => x > 25).length, ...d0, layoutsPerFrame: d0.layouts / r.frames, recalcsPerFrame: d0.recalcs / r.frames };
}

// ── S3: pointer over the hero and the cards ──
async function pointerRun(browser, base, path) {
  const { ctx, page, cdp } = await session(browser, { viewport: { width: 1440, height: 900 }, cpu: 4 });
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  const m0 = await metrics(cdp);
  for (let i = 0; i < 240; i++) { await page.mouse.move(120 + (i * 5) % 1200, 150 + Math.sin(i / 12) * 260 + 300); }
  await page.waitForTimeout(400);
  const m1 = await metrics(cdp);
  await ctx.close();
  return diff(m0, m1);
}

// ── S4/S5/S6: UI interactions ──
async function interactions(browser, base) {
  const out = {};
  {
    const { ctx, page, cdp } = await session(browser, { viewport: { width: 1280, height: 800 } });
    await page.goto(base + '/residences.html', { waitUntil: 'load' }); await page.waitForTimeout(2500);
    const m0 = await metrics(cdp);
    for (let i = 0; i < 12; i++) { await page.locator(`.pin[data-apt="${(i % 4) + 1}"]`).click(); await page.waitForTimeout(120); }
    out.aptSwitch = diff(m0, await metrics(cdp));
    await ctx.close();
  }
  {
    const { ctx, page, cdp } = await session(browser, { viewport: { width: 1280, height: 800 } });
    await page.goto(base + '/gallery.html', { waitUntil: 'load' }); await page.waitForTimeout(2500);
    const m0 = await metrics(cdp);
    await page.locator('.gal figure:not([hidden])').first().click();
    await page.waitForTimeout(500);
    for (let i = 0; i < 5; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150); }
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    out.gallery = diff(m0, await metrics(cdp));
    await ctx.close();
  }
  {
    const { ctx, page, cdp } = await session(browser, { viewport: { width: 1280, height: 800 } });
    await page.goto(base + '/index.html', { waitUntil: 'load' }); await page.waitForTimeout(3000);
    const m0 = await metrics(cdp);
    for (let i = 0; i < 4; i++) { await page.locator('#theme-btn').click(); await page.waitForTimeout(900); }
    out.theme = diff(m0, await metrics(cdp));
    await ctx.close();
  }
  return out;
}

// ── S7: the two 3D viewers, steady state for 4 seconds after they are ready ──
async function viewerRun(browser, base, path, readySel) {
  const { ctx, page, cdp } = await session(browser, { viewport: { width: 1100, height: 700 }, cpu: 2 });
  const t0 = Date.now();
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForFunction(readySel, null, { timeout: 90000 }).catch(() => {});
  const ready = Date.now() - t0;
  await page.waitForTimeout(1500);
  const m0 = await metrics(cdp);
  const frames = await page.evaluate(() => new Promise((res) => { let n = 0; const end = performance.now() + 4000; (function f(t) { n++; if (t < end) requestAnimationFrame(f); else res(n); })(performance.now()); }));
  const d = diff(m0, await metrics(cdp));
  await ctx.close();
  return { ready, rafFrames: frames, ...d };
}

const report = {};
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const collect = async (name, fn) => {
  report[name] = { A: [], B: [] };
  for (let i = 0; i < runs; i++) {
    for (const [k, base] of [['A', A], ['B', B]]) { try { report[name][k].push(await fn(base)); } catch (e) { console.error(name, k, e.message.split('\n')[0]); } }
  }
};
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (n) => !only.length || only.includes(n);
if (want('load-home-fa')) await collect('load-home-fa', (b) => coldLoad(browser, b, '/index.html'));
if (want('load-home-en')) await collect('load-home-en', (b) => coldLoad(browser, b, '/en/index.html'));
if (want('load-gallery')) await collect('load-gallery', (b) => coldLoad(browser, b, '/gallery.html'));
if (want('load-residence')) await collect('load-residence', (b) => coldLoad(browser, b, '/residence-2.html'));
if (want('scroll-home')) await collect('scroll-home', (b) => scrollRun(browser, b, '/index.html'));
if (want('scroll-gallery')) await collect('scroll-gallery', (b) => scrollRun(browser, b, '/gallery.html'));
if (want('scroll-project')) await collect('scroll-project', (b) => scrollRun(browser, b, '/project.html'));
if (want('pointer-home')) await collect('pointer-home', (b) => pointerRun(browser, b, '/index.html'));
if (want('pointer-residences')) await collect('pointer-residences', (b) => pointerRun(browser, b, '/residences.html'));
if (want('interactions')) {
  const n = Math.max(2, Math.ceil(runs / 2));
  for (const key of ['aptSwitch', 'gallery', 'theme']) report[key] = { A: [], B: [] };
  for (let i = 0; i < n; i++) for (const [k, base] of [['A', A], ['B', B]]) { const r = await interactions(browser, base); for (const key of Object.keys(r)) report[key][k].push(r[key]); }
}
if (want('viewer-tower')) { report['viewer-tower'] = { A: [], B: [] }; for (let i = 0; i < Math.min(3, runs); i++) for (const [k, base] of [['A', A], ['B', B]]) report['viewer-tower'][k].push(await viewerRun(browser, base, '/tower-viewer/index.html#nointro', "document.querySelector('#status')?.classList.contains('gone')")); }
if (want('viewer-apt')) { report['viewer-apt'] = { A: [], B: [] }; for (let i = 0; i < Math.min(3, runs); i++) for (const [k, base] of [['A', A], ['B', B]]) report['viewer-apt'][k].push(await viewerRun(browser, base, '/residences-3d/index.html?apt=2&lang=en', "!document.querySelector('#loading') || document.querySelector('#loading').hidden || getComputedStyle(document.querySelector('#loading')).display === 'none'")); }
await browser.close();

fs.writeFileSync(process.env.OUT || '/tmp/claude-501/perf_ab.json', JSON.stringify(report, null, 1));
const KEYS = ['fcp', 'lcp', 'tbt', 'cls', 'load', 'requests', 'bytes', 'imgBytes', 'dupes', 'script', 'layout', 'style', 'task', 'layouts', 'recalcs', 'p50', 'p95', 'worst', 'over25', 'layoutsPerFrame', 'recalcsPerFrame', 'ready', 'rafFrames'];
for (const [name, v] of Object.entries(report)) {
  console.log(`\n## ${name}  (A = ${A}, B = ${B}; median [min–max] over ${v.A.length} runs)`);
  for (const key of KEYS) {
    if (!v.A.length || v.A[0][key] === undefined) continue;
    const a = v.A.map((r) => r[key]), b = v.B.map((r) => r[key]);
    const fmt = (x) => (Math.abs(x) < 10 && key !== 'requests' ? x.toFixed(2) : x.toFixed(0));
    const ma = med(a), mb = med(b);
    console.log(`  ${key.padEnd(16)} A ${fmt(ma).padStart(8)} [${spread(a)}]   B ${fmt(mb).padStart(8)} [${spread(b)}]   ${ma ? ((mb - ma) / ma * 100).toFixed(0).padStart(5) + '%' : ''}`);
  }
}
