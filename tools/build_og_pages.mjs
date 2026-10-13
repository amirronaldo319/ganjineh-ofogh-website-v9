// One 1200x630 share card per page and language, so a link pasted into WhatsApp/Telegram/X shows that page.
//
//   node tools/build_og_pages.mjs        (build_site.py runs it; it only redraws cards whose title, text or image changed)
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveRoot } from './_static_server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const OUT = path.join(ROOT, 'assets', 'og');
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
const stateFile = path.join(OUT, '.state.json');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'site.config.json'), 'utf8'));
const DOMAIN = (cfg.host || 'https://ganjinehofogh.ir').replace(/^https?:\/\//, '').replace(/\/$/, '');
const VERSION = 'v2';                       // bump when the card design changes

const todo = manifest.filter((m) => {
  const hash = crypto.createHash('sha1').update(JSON.stringify([VERSION, m, DOMAIN])).digest('hex');
  m.hash = hash;
  return state[`${m.key}-${m.lang}`] !== hash || !fs.existsSync(path.join(OUT, `${m.key}-${m.lang}.jpg`));
});
if (!todo.length) { console.log(`share cards: ${manifest.length} up to date`); process.exit(0); }

let chromium;
try { ({ chromium } = require('@playwright/test')); } catch { console.log('share cards: skipped (needs npm install)'); process.exit(0); }
const { origin, close } = await serveRoot(ROOT);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' }).catch(() => chromium.launch());
// First sentence only (a semicolon is not a sentence end), and nothing when it just repeats the title.
const first = (text) => (text.split(/(?<=[.!؟?])\s/)[0] || text).slice(0, 170);
const words = (t) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2));
const repeats = (a, b) => { const x = words(a), y = words(b); const same = [...y].filter((w) => x.has(w)).length; return y.size > 0 && same / y.size > 0.7; };
const TAGLINE = { fa: 'نور روز و زندگی روشن‌تر.', en: 'Daylight, and a brighter way to live.' };
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const m of todo) {
  const rtl = m.lang === 'fa';
  const title = m.title.replace(/\s*[·|]\s*(برج )?(گنجینه افق|Ganjineh Ofogh)\s*$/, '');
  const html = `<!doctype html><html lang="${m.lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
@font-face{font-family:Vazirmatn;src:url(${origin}/assets/fonts/Vazirmatn-normal-arabic.woff2) format('woff2');font-weight:100 900}
@font-face{font-family:'Source Serif 4';src:url(${origin}/assets/fonts/SourceSerif4-normal-latin.woff2) format('woff2');font-weight:300 700}
@font-face{font-family:Inter;src:url(${origin}/assets/fonts/Inter-normal-latin.woff2) format('woff2');font-weight:300 700}
*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;position:relative;overflow:hidden;background:#101a16;color:#f1ecdd;font-family:${rtl ? 'Vazirmatn' : 'Inter'},sans-serif}
img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.shade{position:absolute;inset:0;background:linear-gradient(${rtl ? 270 : 90}deg,rgba(10,18,14,.94) 0%,rgba(10,18,14,.82) 42%,rgba(10,18,14,.15) 100%)}
.in{position:absolute;inset:56px;display:flex;flex-direction:column;justify-content:space-between;max-width:700px}
.brand{display:flex;align-items:center;gap:14px;color:#d9bd7c;font-size:26px;letter-spacing:${rtl ? 0 : '.14em'};text-transform:${rtl ? 'none' : 'uppercase'}}
.brand i{width:40px;height:2px;background:#d9bd7c;display:block}
h1{font-family:${rtl ? 'Vazirmatn' : "'Source Serif 4'"},serif;font-weight:${rtl ? 700 : 400};font-size:${title.length > 34 ? 56 : 68}px;line-height:${rtl ? 1.4 : 1.1};letter-spacing:-.01em;text-wrap:balance}
p{margin-top:22px;font-size:27px;line-height:1.55;color:#e0d9c3}
.dom{font-family:Inter,sans-serif;direction:ltr;font-size:24px;letter-spacing:.06em;color:#d9bd7c;align-self:${rtl ? 'flex-end' : 'flex-start'}}
</style></head><body><img src="${origin}/assets/img/${m.image}" alt=""><div class="shade"></div>
<div class="in"><span class="brand"><i></i>${rtl ? 'برج گنجینه افق' : 'Ganjineh Ofogh'}</span><div><h1>${title}</h1>${(() => { const line = m.key === 'index' ? TAGLINE[m.lang] : first(m.desc); return repeats(title, line) && m.key !== 'index' ? '' : `<p>${line}</p>`; })()}</div><span class="dom">${DOMAIN}</span></div></body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.screenshot({ path: path.join(OUT, `${m.key}-${m.lang}.jpg`), type: 'jpeg', quality: 84 });
  state[`${m.key}-${m.lang}`] = m.hash;
}
await browser.close();
close();
fs.writeFileSync(stateFile, JSON.stringify(state, null, 1));
console.log(`share cards: ${todo.length} drawn, ${manifest.length - todo.length} unchanged`);
