// Social cards for Instagram and Telegram, rendered from the site's own images and fonts.
//
//   node tools/build_social.mjs            → launch/social/{fa,en}/<card>-{square,story,wide}.jpg
//
// Every line of text on a card is copied from the site (tagline, section titles, the supplied area range); nothing new is claimed.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveRoot } from './_static_server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const HOST = (JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'site.config.json'), 'utf8')).host || 'https://ganjinehofogh.ir').replace(/\/$/, '');
const DOMAIN = HOST.replace(/^https?:\/\//, '');

const FORMATS = { square: [1080, 1080], story: [1080, 1920], wide: [1280, 720] };
// image = a file in assets/img; position tunes the crop (CSS object-position)
const CARDS = [
  { id: 'brand', image: 'hero-2200.webp', pos: '50% 30%',
    fa: ['تهران / ازگل', 'گنجینه افق', 'نور روز و زندگی روشن‌تر.'], en: ['Tehran / Ozgol', 'Ganjineh Ofogh', 'Daylight, and a brighter way to live.'] },
  { id: 'residences', image: 'living-1536.webp', pos: '50% 50%',
    fa: ['واحدها', 'چهار واحد سه‌خوابه', 'در هر طبقه‌ی تیپ؛ از ۱۴۳٫۲۵ تا ۱۶۶ متر مربع*'], en: ['Residences', 'Four three-bedroom residences', 'On every typical floor; 143.25 to 166 m²*'] },
  { id: 'philosophy', image: 'panorama-1536.webp', pos: '50% 50%',
    fa: ['رویکرد طراحی', 'نور، آرامش، پیوند', 'برج گنجینه افق، ازگل تهران'], en: ['Design approach', 'Light, calm, connection', 'Ganjineh Ofogh, Ozgol, Tehran'] },
  { id: 'model3d', image: 'tower-dusk-1024.webp', pos: '50% 35%',
    fa: ['مدل سه‌بعدی', 'برج را در سه‌بعد ببینید', 'روز، غروب، شب'], en: ['3D model', 'See the tower in 3D', 'Day, golden hour, night'] },
  { id: 'lifestyle', image: 'cinema-1800.webp', pos: '50% 50%',
    fa: ['سبک زندگی', 'زندگی، فراتر از خانه', 'سالن جشن · سینما · فضای ورزش · کافی‌شاپ و کتابخانه'], en: ['Lifestyle', 'Living beyond the home', 'Celebration hall · cinema · fitness · café and library'] },
  { id: 'brochure', image: 'aerial-1448.webp', pos: '50% 50%',
    fa: ['بروشور پروژه', 'بروشور را همراه خود ببرید', `${DOMAIN}/brochure.html`], en: ['The project brochure', 'Take the brochure with you', `${DOMAIN}/en/brochure.html`] },
];

function html(card, lang, format, origin) {
  const [w, h] = FORMATS[format];
  const [eyebrow, title, sub] = card[lang];
  const rtl = lang === 'fa';
  const small = format === 'wide';
  const note = card.id === 'residences' ? (rtl ? '* مساحت‌ها بر پایه‌ی اطلاعات ارائه‌شده است' : '* Areas as supplied') : '';
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
@font-face{font-family:Vazirmatn;src:url(${origin}/assets/fonts/Vazirmatn-normal-arabic.woff2) format('woff2');font-weight:100 900}
@font-face{font-family:'Source Serif 4';src:url(${origin}/assets/fonts/SourceSerif4-normal-latin.woff2) format('woff2');font-weight:300 700}
@font-face{font-family:Inter;src:url(${origin}/assets/fonts/Inter-normal-latin.woff2) format('woff2');font-weight:300 700}
*{box-sizing:border-box;margin:0}
body{width:${w}px;height:${h}px;position:relative;overflow:hidden;background:#101a16;color:#f1ecdd;font-family:${rtl ? 'Vazirmatn' : 'Inter'},sans-serif}
img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${card.pos}}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,18,14,.28) 0%,rgba(10,18,14,0) 28%,rgba(10,18,14,.55) 62%,rgba(10,18,14,.92) 100%)}
.in{position:absolute;inset:${small ? 56 : 72}px;display:flex;flex-direction:column;justify-content:space-between}
.top{display:flex;justify-content:space-between;align-items:center;font-size:${small ? 20 : 26}px;letter-spacing:${rtl ? 0 : '.2em'};text-transform:${rtl ? 'none' : 'uppercase'};color:#d9bd7c}
.brand{font-family:${rtl ? 'Vazirmatn' : "'Source Serif 4'"},serif;font-size:${small ? 30 : 40}px;letter-spacing:0;text-transform:none;color:#f1ecdd;display:flex;align-items:center;gap:16px}
.brand i{width:34px;height:2px;background:#d9bd7c;display:block}
h1{font-family:${rtl ? 'Vazirmatn' : "'Source Serif 4'"},serif;font-weight:${rtl ? 700 : 400};font-size:${small ? 64 : format === 'story' ? 104 : 92}px;line-height:${rtl ? 1.35 : 1.06};letter-spacing:-.01em;max-width:${small ? 900 : 880}px;text-wrap:balance}
p{margin-top:${small ? 16 : 26}px;font-size:${small ? 26 : 36}px;line-height:1.55;color:#e6dfc9;max-width:${small ? 900 : 880}px}
.note{font-size:${small ? 18 : 24}px;color:#b8b19a;margin-top:18px}
.eyebrow{display:inline-flex;align-items:center;gap:14px;font-size:${small ? 20 : 26}px;color:#d9bd7c;letter-spacing:${rtl ? 0 : '.18em'};text-transform:${rtl ? 'none' : 'uppercase'};margin-bottom:${small ? 14 : 22}px}
.eyebrow i{width:46px;height:1px;background:#d9bd7c;display:block}
.dom{font-family:Inter,sans-serif;direction:ltr;font-size:${small ? 20 : 26}px;letter-spacing:.06em;color:#d9bd7c}
</style></head><body><img src="${origin}/assets/img/${card.image}" alt=""><div class="shade"></div>
<div class="in"><div class="top"><span class="brand"><i></i>${rtl ? 'گنجینه افق' : 'Ganjineh Ofogh'}</span><span class="dom">${DOMAIN}</span></div>
<div><span class="eyebrow"><i></i>${eyebrow}</span><h1>${title}</h1><p>${sub}</p>${note ? `<div class="note">${note}</div>` : ''}</div></div></body></html>`;
}

const { origin, close } = await serveRoot(ROOT);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' }).catch(() => chromium.launch());
let count = 0;
for (const lang of ['fa', 'en']) {
  const dir = path.join(ROOT, 'launch', 'social', lang);
  fs.mkdirSync(dir, { recursive: true });
  for (const card of CARDS) {
    for (const format of Object.keys(FORMATS)) {
      const [w, h] = FORMATS[format];
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.setContent(html(card, lang, format, origin), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(dir, `${card.id}-${format}.jpg`), type: 'jpeg', quality: 90 });
      await page.close();
      count++;
    }
  }
}
await browser.close();
close();
console.log(`social cards: ${count} images in launch/social/`);
