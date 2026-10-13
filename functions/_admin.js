// The sales inbox: one server-rendered Persian page, no JavaScript on the page, no third-party requests.
import { STATUSES, basicAuth, csrfToken, escapeHtml, json, unauthorized } from './_lib.js';

const ROUTE_LABELS = { visit: 'بازدید', brochure: 'بروشور (ایمیل)', download: 'دانلود بروشور', advisor: 'تماس مشاور' };
const UNIT_LABELS = { 'residence-1': 'واحد ۱', 'residence-2': 'واحد ۲', 'residence-3': 'واحد ۳', 'residence-4': 'واحد ۴',
  'type-a': 'واحد ۱ (قدیمی)', 'type-b': 'واحد ۴ (قدیمی)', 'type-c': 'واحد ۳ (قدیمی)', 'type-d': 'واحد ۲ (قدیمی)' };
const VISIT_LABELS = { 'in-person': 'حضوری', phone: 'تلفنی', video: 'تصویری' };
const COLUMNS = ['reference', 'created_at', 'route', 'name', 'mobile', 'email', 'unit', 'visit_type', 'visit_date', 'visit_time',
  'message', 'page', 'source', 'campaign', 'consent', 'status', 'note', 'downloaded_at'];
const toPersianDigits = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

const stampFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const stamp = (iso) => { try { return stampFormat.format(new Date(iso)).replace('،‏', '').replace('،', ''); } catch { return iso; } };

/** Gate: returns a Response to send back (401/404/429), or null when the caller may proceed. */
export async function guard(context) {
  const { env, request } = context;
  if (!env.ADMIN_PASSWORD) return new Response('Not found', { status: 404 });
  // Basic auth carries the password on every request, so it is only accepted over HTTPS (or the local dev server).
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) return new Response('Not found', { status: 404 });
  const ok = await basicAuth(request, env.ADMIN_USER || 'admin', env.ADMIN_PASSWORD);
  return ok ? null : unauthorized('Ganjineh Ofogh sales');
}

export async function rows(env, status, route) {
  let sql = 'SELECT * FROM enquiries WHERE 1=1';
  const args = [];
  if (STATUSES[status]) { sql += ' AND status = ?'; args.push(status); }
  if (ROUTE_LABELS[route]) { sql += ' AND route = ?'; args.push(route); }
  const { results } = await env.DB.prepare(sql + ' ORDER BY created_at DESC LIMIT 1000').bind(...args).all();
  return results;
}

const safeCell = (v) => { const t = v == null ? '' : String(v); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };
const csvCell = (v) => { const t = safeCell(v); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };

export const exportCsv = (list) => '﻿' + [COLUMNS.join(','), ...list.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';

const telHref = (m) => { const d = String(m).replace(/\D/g, ''); return d.startsWith('98') ? '+' + d : '+98' + d.replace(/^0+/, ''); };

function detail(r) {
  const parts = [];
  if (r.unit) parts.push(UNIT_LABELS[r.unit] || r.unit);
  if (r.route === 'visit') parts.push([VISIT_LABELS[r.visit_type] || '', [r.visit_date, r.visit_time].filter(Boolean).join(' ')].filter(Boolean).join(' · '));
  if (r.email) parts.push(r.email);
  if (r.message) parts.push(r.message);
  return parts.filter(Boolean).join(' — ');
}

export async function renderPage(env, status, route, flash) {
  const list = await rows(env, status, route);
  const { results: counted } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM enquiries GROUP BY status').all();
  const totals = Object.fromEntries(counted.map((c) => [c.status, c.n]));
  const token = await csrfToken(env.ADMIN_PASSWORD);
  const q = (o) => { const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v)); const s = p.toString(); return '/admin' + (s ? '?' + s : ''); };
  const link = (label, o) => `<a href="${escapeHtml(q(o))}"${(o.status || '') === status && (o.route || '') === route ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`;
  const filters = [link('همه', { route }), ...Object.entries(STATUSES).map(([k, l]) => link(toPersianDigits(`${l} (${totals[k] || 0})`), { status: k, route }))].join(' ');
  const routes = [link('همه‌ی انواع', { status }), ...Object.entries(ROUTE_LABELS).map(([k, l]) => link(l, { status, route: k }))].join(' ');
  const body = list.map((r) => {
    const options = Object.entries(STATUSES).map(([k, v]) => `<option value="${k}"${k === r.status ? ' selected' : ''}>${v}</option>`).join('');
    return `<tr class="s-${escapeHtml(r.status || 'new')}"><td>${stamp(r.created_at)}</td><td><code>${escapeHtml(r.reference)}</code></td>` +
      `<td>${escapeHtml(ROUTE_LABELS[r.route] || r.route)}</td><td>${escapeHtml(r.name)}</td>` +
      `<td dir="ltr"><a href="tel:${escapeHtml(telHref(r.mobile))}">${escapeHtml(r.mobile)}</a></td>` +
      `<td>${escapeHtml(detail(r))} <small>${r.downloaded_at ? '✓ دانلود شد' : ''}</small></td>` +
      `<td><form method="post" action="/admin/update"><input type="hidden" name="csrf" value="${token}">` +
      `<input type="hidden" name="reference" value="${escapeHtml(r.reference)}"><input type="hidden" name="back" value="${escapeHtml(new URLSearchParams({ status, route }).toString())}">` +
      `<select name="status" aria-label="وضعیت">${options}</select>` +
      `<input name="note" value="${escapeHtml(r.note || '')}" maxlength="500" placeholder="یادداشت" aria-label="یادداشت"><button>ذخیره</button></form></td></tr>`;
  }).join('');
  const table = list.length
    ? `<table><thead><tr><th>زمان (تهران)</th><th>شماره پیگیری</th><th>نوع</th><th>نام</th><th>موبایل</th><th>جزئیات</th><th>پیگیری</th></tr></thead><tbody>${body}</tbody></table>`
    : '<p class="empty">درخواستی در این فیلتر نیست.</p>';
  const exportHref = '/admin/export.csv' + (status || route ? '?' + new URLSearchParams(Object.entries({ status, route }).filter(([, v]) => v)).toString() : '');
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>درخواست‌ها · گنجینه افق</title><style>
@font-face{font-family:Vazirmatn;src:url(/assets/fonts/Vazirmatn-normal-arabic.woff2) format('woff2');font-display:swap}
:root{color-scheme:light dark;--bg:#f4f1e8;--ink:#1d2622;--mut:#66705f;--line:#d8d2c0;--card:#fff;--acc:#8a6d2f}
@media (prefers-color-scheme:dark){:root{--bg:#131a17;--ink:#ece7d8;--mut:#9aa392;--line:#2d3833;--card:#1a2420;--acc:#d3b66d}}
*{box-sizing:border-box}body{margin:0;font:15px/1.7 Vazirmatn,system-ui,sans-serif;background:var(--bg);color:var(--ink)}
main{max-width:1280px;margin:auto;padding:24px 16px 64px}h1{font-size:1.4rem;margin:0 0 4px}p.sub{color:var(--mut);margin:0 0 18px}
nav.f{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}nav.f a{padding:4px 12px;border:1px solid var(--line);border-radius:99px;color:var(--ink);text-decoration:none;background:var(--card)}
nav.f a[aria-current]{background:var(--acc);color:#fff;border-color:transparent}.bar{display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap}
.export{padding:8px 16px;border-radius:8px;background:var(--ink);color:var(--bg);text-decoration:none}
.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px;margin-top:14px}
table{border-collapse:collapse;width:100%;min-width:980px}th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:start;vertical-align:top}
th{font-weight:600;color:var(--mut);font-size:.85rem}td a{color:var(--acc)}code{font-family:ui-monospace,monospace;font-size:.85rem}
tr.s-closed,tr.s-spam{opacity:.55}td small{color:var(--acc)}form{display:flex;gap:6px}form input[name=note]{flex:1;min-width:140px}
select,input,button{font:inherit;padding:4px 8px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}button{cursor:pointer;background:var(--acc);color:#fff;border:0}
.flash{background:var(--acc);color:#fff;padding:8px 14px;border-radius:8px;margin:10px 0}.empty{padding:28px;text-align:center;color:var(--mut)}
</style></head><body><main><div class="bar"><div><h1>درخواست‌های ثبت‌شده</h1><p class="sub">${toPersianDigits(list.length)} مورد نمایش داده می‌شود · فقط برای تیم فروش</p></div>
<a class="export" href="${escapeHtml(exportHref)}">دریافت فایل CSV</a></div>${flash ? `<p class="flash" role="status">${escapeHtml(flash)}</p>` : ''}
<nav class="f" aria-label="فیلتر وضعیت">${filters}</nav><nav class="f" aria-label="فیلتر نوع">${routes}</nav>
<div class="wrap">${table}</div></main></body></html>`;
}

export const htmlResponse = (html) => new Response(html, { headers: {
  'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'x-frame-options': 'DENY' } });
export { json };
