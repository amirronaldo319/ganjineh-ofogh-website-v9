// Language layer for the 3D apartment viewer. The viewer's own strings are Persian; this module translates the
// rendered text (and a few attributes) to English on demand, so the 3D code itself stays untouched.
// Language comes from ?lang=, then the site's stored choice, then the browser. The site page can switch it live
// with postMessage({src:'ofogh-site', lang}); the standalone page has its own EN/فا button.
const FA_TO_EN = {
  'کاوش سه‌بعدی واحدها · برج گنجینه افق':'3D apartment explorer · Ganjineh Ofogh',
  'چهار واحد برج گنجینه افق را در مدل سه‌بعدی مبله کاوش کنید.':'Explore the four apartments of Ganjineh Ofogh in furnished 3D models.',
  'کاوش سه‌بعدی واحدها':'3D apartment explorer','بازگشت به واحدها':'Back to the residences','گنجینه افق':'Ganjineh Ofogh',
  'فضای خود را کاوش کنید':'Explore your space','یکی از واحدها را انتخاب کنید.':'Choose one of the apartments.',
  'انتخاب واحد':'Choose an apartment','انتخاب فضا':'Choose a room','یک فضا را انتخاب کنید':'Choose a room',
  'مدل تصویری مفهومی؛ ابعاد و چیدمان نهایی تابع نقشه‌های مصوب است.':'A concept model; final dimensions and layout are subject to approved drawings.',
  'ابعاد و چیدمان نهایی تابع نقشه‌های مصوب است.':'Final dimensions and layout are subject to approved drawings.',
  'مدل تصویری مفهومی':'Concept model','نمایشگر سه‌بعدی واحد':'3D apartment viewer','حالت نمایش':'View mode',
  'مدل سه‌بعدی واحد. برای چرخاندن بکشید، با کلیدهای جهت جابه‌جا کنید و با اسکرول بزرگ‌نمایی کنید.':'3D model of the apartment. Drag to rotate, move with the arrow keys and zoom with scroll.',
  'پلان مفهومی واحد':'Concept plan of the apartment','پلان مفهومی':'Concept plan','در حال آماده‌سازی مدل':'Preparing the model',
  'نمایش سه‌بعدی در این مرورگر در دسترس نیست.':'3D view is not available in this browser.',
  'همچنان می‌توانید پلان واحد را ببینید.':'You can still view the apartment plan.','مشاهده پلان':'View plan','جهت شمال':'North',
  'برای نگاه کردن بکشید · برای حرکت روی کف ضربه بزنید · روی رایانه: W A S D و کلیدهای جهت':'Drag to look · tap the floor to move · on a computer: W A S D and the arrow keys',
  'برای چرخاندن بکشید · برای بزرگ‌نمایی اسکرول کنید یا با دو انگشت باز کنید · یک فضا را انتخاب کنید':'Drag to rotate · scroll or pinch to zoom · select a room',
  'تصویر این فضا در گالری':'Image of this room in the gallery','مشاهده در گالری':'View in gallery',
  'تصویرسازی نمونه؛ وابسته به واحد مشخصی نیست':'Sample visualisation; not specific to one apartment',
  'خروج از گردش':'Exit walkthrough','گردش در واحد آغاز شد':'Walkthrough started','گردش در واحد':'Walk through the apartment','گردش':'Walk',
  'فضای قبلی':'Previous room','فضای بعدی':'Next room','لغو انتخاب فضا':'Clear room selection','قبلی':'Previous','بعدی':'Next',
  'نمای سه‌بعدی':'3D view','نمای از بالا':'Top view','از بالا':'Top','سه‌بعدی':'3D','کوچک‌نمایی':'Zoom out','بزرگ‌نمایی':'Zoom in',
  'بازنشانی نما':'Reset view','خروج از تمام‌صفحه':'Exit full screen','تمام‌صفحه':'Full screen','نمای شب':'Night view','نمای روز':'Day view',
  'مدل سه‌بعدی':'3D model','پلان':'Plan','دیوارها':'Walls','برش':'Cut','مبلمان':'Furniture','نام فضاها':'Room names','شب':'Night','روز':'Day',
  'کامل':'Full','خروج':'Exit','نمایش':'Show','انتخاب شد':'selected',
  'فضای دیگری را برای ادامه کاوش انتخاب کنید.':'Choose another room to keep exploring.',
  'برای دیدن پلان هر واحد، آن را انتخاب کنید':'Select an apartment to see its plan',
  'اتاق خواب اصلی':'Primary bedroom','اتاق خواب دو تخته':'Twin bedroom','اتاق خواب سوم':'Third bedroom','حمام اتاق اصلی':'En suite',
  'سرویس مهمان':'Guest WC','آشپزخانه جانبی':'Service kitchen','آشپزخانه':'Kitchen','پذیرایی':'Living room','نشیمن':'Lounge',
  'ناهارخوری':'Dining','ورودی':'Entrance','بالکن':'Balcony','حمام':'Bathroom','سرویس بهداشتی':'bathrooms','اتاق خواب':'bedrooms',
  'تخت دونفره، تاج تخت پارچه‌ای، روتختی لایه‌ای و چراغ کنار تخت.':'A double bed, an upholstered headboard, layered bedding and bedside lamps.',
  'دو تخت یک‌نفره با روتختی جداگانه و فرش مشترک.':'Two single beds with separate bedding and a shared rug.',
  'اتاق خواب سوم؛ در این مدل با چیدمان اتاق کار نمایش داده شده است.':'The third bedroom; shown in this model furnished as a study.',
  'دوش شیشه‌ای، روشویی، آینه و سرویس.':'Glass shower, vanity, mirror and WC.','دوش شیشه‌ای، کابینت روشویی و متعلقات حمام.':'Glass shower, vanity cabinet and bathroom fittings.',
  'سرویس و روشویی با آینه.':'WC and basin with a mirror.','کانترهای سنگی، لوازم توکار، جزیره و صندلی‌های صبحانه.':'Stone counters, built-in appliances, an island and breakfast stools.',
  'فضای آماده‌سازی جانبی و بسته.':'A separate, closed preparation space.','مبلمان راحتی، فرش بافت‌دار و میز سنگی.':'Comfortable seating, a textured rug and a stone table.',
  'گروهی جداگانه از مبلمان برای استفاده روزمره.':'A separate group of furniture for everyday use.','میز ناهارخوری با صندلی‌های پارچه‌ای.':'A dining table with upholstered chairs.',
  'ورودی واحد و ارتباط آن با فضاهای زندگی.':'The apartment entrance and its link to the living spaces.','فضای باز فرورفته‌ای که در پلان دیده می‌شود.':'The recessed open space shown on the plan.',
  'متر مربع':'m²','واحد ':'Apartment ','واحد':'Apartment',
};
const phrases = Object.keys(FA_TO_EN).sort((a, b) => b.length - a.length);
const DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const toLatin = s => s.replace(/[۰-۹]/g, d => DIGITS.indexOf(d)).replace(/٫/g, '.');
const hasFa = s => /[؀-ۿ]/.test(s);

const q = new URLSearchParams(location.search);
let lang = q.get('lang');
if (lang !== 'fa' && lang !== 'en') {
  try { lang = localStorage.getItem('ofogh-lang'); } catch (e) { lang = null; }
}
if (lang !== 'fa' && lang !== 'en') lang = /^fa/i.test(navigator.language || '') ? 'fa' : 'en';

const original = new WeakMap();   // node -> Persian text/attribute value as the viewer set it
let busy = false;

function translate(text) {
  let out = text;
  for (const p of phrases) if (out.includes(p)) out = out.split(p).join(FA_TO_EN[p]);
  return toLatin(out);
}
function textNodes(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const list = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) list.push(n);
  return list;
}
const ATTRS = ['aria-label', 'title', 'alt', 'placeholder'];
function applyNode(node) {
  if (node.nodeType === 3) {
    const v = node.nodeValue;
    if (!v || !v.trim()) return;
    if (lang === 'en') {
      if (!hasFa(v) && !/[۰-۹]/.test(v)) return;
      original.set(node, v);
      let out = translate(v);
      // The four plan cards are narrow on phones: "Apt 1" instead of "Apartment 1".
      if (node.parentElement && node.parentElement.closest('.plancard')) out = out.replace('Apartment ', 'Apt ');
      node.nodeValue = out;
    }
    return;
  }
  if (node.nodeType !== 1) return;
  for (const a of ATTRS) {
    if (!node.hasAttribute(a)) continue;
    const key = '__fa_' + a;
    const cur = node.getAttribute(a);
    if (lang === 'en' && (hasFa(cur) || /[۰-۹]/.test(cur))) { node[key] = cur; node.setAttribute(a, translate(cur)); }
  }
}
function run(root) {
  busy = true;
  if (root.nodeType === 3) { applyNode(root); busy = false; return; }   // a lone text node has no descendants to walk
  if (root.nodeType === 1) applyNode(root);
  for (const n of textNodes(root)) applyNode(n);
  if (root.querySelectorAll) for (const el of root.querySelectorAll('*')) applyNode(el);
  busy = false;
}
function restore() {
  busy = true;
  for (const n of textNodes(document.body)) { const o = original.get(n); if (o !== undefined) { n.nodeValue = o; original.delete(n); } }
  for (const el of document.querySelectorAll('*')) for (const a of ATTRS) { const k = '__fa_' + a; if (el[k] !== undefined) { el.setAttribute(a, el[k]); delete el[k]; } }
  busy = false;
}

// Links back to the site point at the page's own language (/en/…).
function fixLinks() {
  document.querySelectorAll('a[href^="../"]').forEach(a => {
    const h = a.getAttribute('href');
    if (lang === 'en' && !h.startsWith('../en/') && !h.startsWith('../assets/')) a.setAttribute('href', '../en/' + h.slice(3));
    if (lang === 'fa' && h.startsWith('../en/')) a.setAttribute('href', '../' + h.slice(6));
  });
}

function setLang(next, persist) {
  if (next !== 'fa' && next !== 'en') return;
  if (next === lang && document.documentElement.lang === next) return;
  if (lang === 'en') restore();
  lang = next;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  const btn = document.getElementById('lang-btn');
  if (btn) btn.textContent = lang === 'fa' ? 'EN' : 'فا';
  if (persist) { try { localStorage.setItem('ofogh-lang', lang); } catch (e) {} }
  if (lang === 'en') { run(document.documentElement); document.title = translate(document.title); }
  else document.title = 'کاوش سه‌بعدی واحدها · برج گنجینه افق';
  fixLinks();
}
window.__goLang = () => lang;

document.documentElement.lang = lang;
document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';

const observer = new MutationObserver(muts => {
  if (busy || lang !== 'en') return;
  busy = true;
  for (const m of muts) {
    if (m.type === 'characterData') applyNode(m.target);
    else if (m.type === 'attributes') applyNode(m.target);
    else for (const added of m.addedNodes) run(added);
  }
  busy = false;
});
function start() {
  const btn = document.getElementById('lang-btn');
  if (btn) { btn.textContent = lang === 'fa' ? 'EN' : 'فا'; btn.addEventListener('click', () => { setLang(lang === 'fa' ? 'en' : 'fa', true); notify(); }); }
  if (lang === 'en') { run(document.documentElement); document.title = translate(document.title); }
  fixLinks();
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
function notify() { try { if (window.parent !== window) window.parent.postMessage({ src: 'ofogh-viewer', type: 'lang', lang }, '*'); } catch (e) {} }
window.addEventListener('message', e => {
  const d = e.data;
  if (d && d.src === 'ofogh-site' && (d.lang === 'fa' || d.lang === 'en')) setLang(d.lang, false);
});
// Loaded as a classic script at the end of <body>, ahead of the heavy 3D module graph, so the first paint is already translated.
if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
