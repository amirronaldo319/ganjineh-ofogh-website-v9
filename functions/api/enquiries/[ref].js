import { BROCHURE_KEY, DOWNLOAD_ROUTES, REFERENCE_RE, clientHash, json, limited } from '../../_lib.js';

// Reveals only whether a reference exists, what kind of request it was, and whether a brochure is on offer.
export async function onRequestGet({ env, params, request }) {
  const ref = String(params.ref || '');
  if (!REFERENCE_RE.test(ref)) return json({ error: 'شماره پیگیری معتبر نیست.' }, 400);
  if (await limited(env, 'lookup', await clientHash(request), 120)) return json({ error: 'درخواست‌های زیادی ارسال شده است. بعداً دوباره تلاش کنید.' }, 429);
  const row = await env.DB.prepare('SELECT route FROM enquiries WHERE reference = ?').bind(ref).first();
  const hasPdf = env.BROCHURE ? !!(await env.BROCHURE.head(BROCHURE_KEY)) : false;
  return json({ exists: !!row, route: row ? row.route : '', download: !!(row && DOWNLOAD_ROUTES.includes(row.route) && hasPdf) });
}
