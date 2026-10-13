// Optional partner password for the whole preview. Set PREVIEW_PASSWORD to turn it on (user name: partner).
// /admin keeps its own, separate password. For this gate to cover the static pages, _routes.json must include "/*".
import { basicAuth, unauthorized } from './_lib.js';

export async function onRequest(context) {
  const { env, request } = context;
  const path = new URL(request.url).pathname;
  if (!env.PREVIEW_PASSWORD || path.startsWith('/admin') || path.startsWith('/api/')) return context.next();
  return (await basicAuth(request, 'partner', env.PREVIEW_PASSWORD)) ? context.next() : unauthorized('Ganjineh Ofogh preview');
}
