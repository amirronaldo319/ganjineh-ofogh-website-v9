// Shared helpers for the Cloudflare Pages Functions version of the enquiry backend (the same rules as server.py).
// Bindings: DB (D1), BROCHURE (R2, key "brochure.pdf"); variables: ACCEPT_ENQUIRIES, ADMIN_PASSWORD, ADMIN_USER,
// NOTIFY_WEBHOOK, PREVIEW_PASSWORD.

export const ROUTES = ['visit', 'brochure', 'advisor', 'download'];
export const DOWNLOAD_ROUTES = ['download', 'brochure'];
export const UNITS = ['', 'residence-1', 'residence-2', 'residence-3', 'residence-4', 'type-a', 'type-b', 'type-c', 'type-d'];
export const PHONE_RE = /^(?:0?9\d{9}|989\d{9})$/;
export const REFERENCE_RE = /^[A-F0-9]{12}$/;
export const BROCHURE_KEY = 'brochure.pdf';
export const STATUSES = { new: 'جدید', contacted: 'تماس گرفته شد', visit: 'قرار بازدید', closed: 'بسته شد', spam: 'هرزنامه' };

export const json = (payload, status = 200, headers = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export const clean = (value, limit = 200) => String(value ?? '').trim().slice(0, limit);

export function normalizeDigits(value) {
  return String(value).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

export async function sha256Hex(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison (both sides hashed first so the lengths match). */
export async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export const clientHash = (request) => sha256Hex('ganjineh|' + (request.headers.get('CF-Connecting-IP') || 'local'));

/** True when this client has used `kind` more than `max` times in the last `windowSeconds`; otherwise records one use. */
export async function limited(env, kind, ipHash, max, windowSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('DELETE FROM limits WHERE at < ?').bind(now - windowSeconds).run();
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM limits WHERE kind = ? AND ip = ?').bind(kind, ipHash).first();
  if (n >= max) return true;
  await env.DB.prepare('INSERT INTO limits (kind, ip, at) VALUES (?, ?, ?)').bind(kind, ipHash, now).run();
  return false;
}

export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || new URL(origin).host === new URL(request.url).host;
}

export async function basicAuth(request, user, password) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded = '';
  try { decoded = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0))); } catch { return false; }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const okUser = await safeEqual(decoded.slice(0, i), user);
  const okPass = await safeEqual(decoded.slice(i + 1), password);
  return okUser && okPass;
}

export const unauthorized = (realm) => new Response('Authentication required', {
  status: 401, headers: { 'www-authenticate': `Basic realm="${realm}", charset="UTF-8"`, 'cache-control': 'no-store' },
});

export const csrfToken = async (password) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('ganjineh-admin-csrf')));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
};

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function notify(context, record) {
  const url = context.env.NOTIFY_WEBHOOK;
  if (!url || !/^https:\/\//.test(url)) return;
  context.waitUntil(fetch(url, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(record) }).catch(() => {}));
}
