import { exportCsv, guard, rows } from '../_admin.js';

export async function onRequestGet(context) {
  const denied = await guard(context);
  if (denied) return denied;
  const q = new URL(context.request.url).searchParams;
  return new Response(exportCsv(await rows(context.env, q.get('status') || '', q.get('route') || '')), { headers: {
    'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="enquiries.csv"', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
