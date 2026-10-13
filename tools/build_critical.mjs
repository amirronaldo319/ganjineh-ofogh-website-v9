// Inline the CSS a page needs for its first screens and load the full stylesheet without blocking paint.
//
//   node tools/build_critical.mjs        (run after tools/build_site.py; build_site.py calls it for you)
//
// For every built page: open it in Chrome at a phone and a desktop size, in Day and Dusk, collect the rules that
// match anything in the first 1.5 screens (plus everything display:none, e.g. the menu and lightbox), and write
// them into <style id="critical">. The full stylesheet stays as <link media="print"> and is switched to "all"
// by a three-line inline script once it has loaded; <noscript> keeps it working without JavaScript.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveRoot } from './_static_server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('@playwright/test')); } catch { console.log('critical CSS: skipped (run npm install for @playwright/test)'); process.exit(0); }

const VIEWS = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const THEMES = ['day', 'dusk'];
const SKIP = new Set(['404.html', 'en/404.html']);
const LINK = /<link rel="stylesheet" href="([^"]*assets\/css\/site\.min\.css[^"]*)">/;

const pages = [...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
  ...fs.readdirSync(path.join(ROOT, 'en')).filter((f) => f.endsWith('.html')).map((f) => `en/${f}`)]
  .filter((f) => !SKIP.has(f));

/** Runs inside the page: returns the CSS text for rules that match an element near the top. */
function extract(base) {
  const vh = innerHeight * 1.5;
  const near = [document.documentElement, document.body, ...document.querySelectorAll('body *')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top + scrollY < vh;
  });
  const STATE = /::?[\w-]+(\([^)]*\))?|:(hover|focus|focus-visible|focus-within|active|visited|checked|disabled|target)\b/g;
  const matches = (sel) => {
    let s = sel;
    try { if (near.some((el) => el.matches(s))) return true; } catch { return true; }
    s = sel.replace(STATE, (m) => (/^:(root|not|is|where|has|first|last|nth|only|empty|lang|dir)/.test(m) ? m : '')).trim();
    if (!s || /[>+~]$/.test(s)) return true;
    try { return near.some((el) => el.matches(s)); } catch { return true; }
  };
  const fixUrls = (text, sheetHref) => text.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g, (m, q, u) => {
    if (/^(data:|https?:|\/\/|#)/.test(u)) return m;
    const abs = new URL(u, sheetHref).href;
    const root = location.origin + '/';
    return `url(${base}${abs.startsWith(root) ? abs.slice(root.length) : abs})`;
  });
  const keyframes = new Map();
  const leaves = [];
  // Every kept rule is recorded with its position in the stylesheet so runs can be merged in cascade order.
  const walk = (rules, order, wrap, sheetHref) => {
    Array.from(rules).forEach((rule, i) => {
      const at = [...order, i];
      const t = rule.constructor.name;
      if (t === 'CSSStyleRule') {
        const keep = rule.selectorText.split(/,(?![^(]*\))/).map((x) => x.trim()).filter(matches);
        if (!keep.length) return;
        if (rule.cssRules && rule.cssRules.length) leaves.push({ at, wrap, text: rule.cssText });
        else leaves.push({ at, wrap, sels: keep, body: rule.style.cssText });
      } else if (t === 'CSSMediaRule' || t === 'CSSSupportsRule' || t === 'CSSLayerBlockRule') {
        walk(rule.cssRules, at, [...wrap, rule.cssText.slice(0, rule.cssText.indexOf('{')).trim()], sheetHref);
      } else if (t === 'CSSKeyframesRule') {
        keyframes.set(rule.name, rule.cssText);
      } else {
        leaves.push({ at, wrap, text: fixUrls(rule.cssText, sheetHref) });   // @font-face, @property, @view-transition …
      }
    });
  };
  const sheet = [...document.styleSheets].find((s) => /site\.min\.css/.test(s.href || ''));
  if (!sheet) return null;
  walk(sheet.cssRules, [], [], sheet.href);
  return { leaves, keyframes: [...keyframes] };
}

/** Merge the runs for one page: union of selectors per rule, in stylesheet order, media blocks re-formed. */
function merge(runs) {
  const byKey = new Map();
  const frames = new Map();
  for (const run of runs) {
    run.keyframes.forEach(([n, t]) => frames.set(n, t));
    for (const leaf of run.leaves) {
      const key = leaf.at.join('.');
      const have = byKey.get(key);
      if (!have) byKey.set(key, { ...leaf, sels: leaf.sels ? new Set(leaf.sels) : null });
      else if (leaf.sels) leaf.sels.forEach((x) => have.sels.add(x));
    }
  }
  const ordered = [...byKey.values()].sort((x, y) => {
    for (let i = 0; i < Math.max(x.at.length, y.at.length); i++) {
      const d = (x.at[i] ?? -1) - (y.at[i] ?? -1);
      if (d) return d;
    }
    return 0;
  });
  let css = '';
  let open = [];
  for (const leaf of ordered) {
    const same = open.length === leaf.wrap.length && open.every((w, i) => w === leaf.wrap[i]);
    if (!same) {
      css += '}'.repeat(open.length);
      open = [...leaf.wrap];
      css += open.map((w) => `${w}{`).join('');
    }
    css += leaf.sels ? `${[...leaf.sels].join(',')}{${leaf.body}}` : leaf.text;
  }
  css += '}'.repeat(open.length);
  const used = [...frames].filter(([name]) => css.includes(name)).map(([, t]) => t);
  return css + used.join('');
}

// A throw-away static server: Chrome will not expose cssRules of file:// stylesheets.
const { origin: ORIGIN, close: closeServer } = await serveRoot(ROOT);

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' }).catch(() => chromium.launch());
let total = 0;
for (const rel of pages) {
  const file = path.join(ROOT, rel);
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/<style id="critical">[\s\S]*?<\/style>/, '')
    .replace(/<link rel="stylesheet" href="([^"]*)" media="print" data-full>\s*<script>[^<]*<\/script>\s*<noscript>[\s\S]*?<\/noscript>/, '<link rel="stylesheet" href="$1">');
  const m = html.match(LINK);
  if (!m) { console.log(`  ${rel}: no stylesheet link, skipped`); continue; }
  fs.writeFileSync(file, html);                                  // render from the plain, blocking version
  const base = rel.startsWith('en/') ? '../' : '';
  const runs = [];
  const ctx = await browser.newContext();
  for (const view of VIEWS) {
    for (const theme of THEMES) {
      const page = await ctx.newPage();
      await page.setViewportSize(view);
      await page.addInitScript((t) => { try { localStorage.setItem('ofogh-site-theme', t); sessionStorage.removeItem('ofogh-intro'); } catch {} }, theme);
      await page.goto(`${ORIGIN}/${rel}` + (rel === 'index.html' || rel === 'en/index.html' ? '?intro=1' : ''), { waitUntil: 'load' });
      const result = await page.evaluate(extract, base);
      if (result) runs.push(result);
      await page.close();
    }
  }
  await ctx.close();
  const critical = merge(runs);
  const style = `<style id="critical">${critical}</style>`;
  const href = m[1];
  const swap = `<link rel="stylesheet" href="${href}" media="print" data-full>` +
    `<script>(function(){var l=document.querySelector('link[data-full]');function f(){l.media='all'}if(l.sheet&&l.sheet.cssRules.length)f();else l.addEventListener('load',f)})()</script>` +
    `<noscript><link rel="stylesheet" href="${href}"></noscript>`;
  fs.writeFileSync(file, html.replace(LINK, `${style}${swap}`));
  total += critical.length;
  console.log(`  ${rel}: ${(critical.length / 1024).toFixed(1)} KB critical`);
}
await browser.close();
closeServer();
console.log(`critical CSS: ${pages.length} pages, average ${(total / pages.length / 1024).toFixed(1)} KB inlined`);
