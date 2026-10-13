import { BROCHURE_KEY, DOWNLOAD_ROUTES, REFERENCE_RE, clientHash, json, limited } from '../../_lib.js';

// The PDF lives in a private R2 bucket and is released only for the reference of a stored brochure request.
export async function onRequestGet({ env, params, request }) {
  const ref = String(params.ref || '');
  const notFound = () => json({ error: 'not found' }, 404);
  if (!REFERENCE_RE.test(ref) || !env.BROCHURE) return notFound();
  if (await limited(env, 'lookup', await clientHash(request), 120)) return notFound();
  const row = await env.DB.prepare('SELECT route FROM enquiries WHERE reference = ?').bind(ref).first();
  if (!row || !DOWNLOAD_ROUTES.includes(row.route)) return notFound();
  const object = await env.BROCHURE.get(BROCHURE_KEY);
  if (!object) return notFound();
  await env.DB.prepare('UPDATE enquiries SET downloaded_at = COALESCE(downloaded_at, ?) WHERE reference = ?').bind(new Date().toISOString(), ref).run();
  return new Response(object.body, { headers: {
    'content-type': 'application/pdf', 'content-length': String(object.size),
    'content-disposition': 'attachment; filename="Ganjineh-Ofogh-brochure.pdf"', 'cache-control': 'no-store', 'x-robots-tag': 'noindex',
  } });
}
