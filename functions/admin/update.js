import { STATUSES, csrfToken, json, safeEqual, sameOrigin } from '../_lib.js';
import { guard } from '../_admin.js';

export async function onRequestPost(context) {
  const denied = await guard(context);
  if (denied) return denied;
  const { request, env } = context;
  if (!sameOrigin(request)) return json({ error: 'origin' }, 403);
  const text = await request.text();
  if (text.length < 1 || text.length > 4096) return json({ error: 'size' }, 413);
  const form = Object.fromEntries(new URLSearchParams(text));
  if (!(await safeEqual(form.csrf || '', await csrfToken(env.ADMIN_PASSWORD)))) return json({ error: 'csrf' }, 403);
  if (!/^[A-F0-9]{12}$/.test(form.reference || '') || !STATUSES[form.status]) return json({ error: 'invalid' }, 422);
  const result = await env.DB.prepare('UPDATE enquiries SET status = ?, note = ? WHERE reference = ?').bind(form.status, (form.note || '').trim().slice(0, 500), form.reference).run();
  if (!result.meta.changes) return json({ error: 'invalid' }, 422);
  const back = form.back ? form.back + '&' : '';
  return new Response(null, { status: 303, headers: { location: '/admin?' + back + 'saved=1' } });
}
