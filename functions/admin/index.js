import { guard, htmlResponse, renderPage } from '../_admin.js';

export async function onRequestGet(context) {
  const denied = await guard(context);
  if (denied) return denied;
  const q = new URL(context.request.url).searchParams;
  return htmlResponse(await renderPage(context.env, q.get('status') || '', q.get('route') || '', q.get('saved') ? 'ذخیره شد.' : ''));
}
