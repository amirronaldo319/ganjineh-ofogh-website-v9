import { BROCHURE_KEY, json } from '../_lib.js';

export async function onRequestGet({ env }) {
  const head = env.BROCHURE ? await env.BROCHURE.head(BROCHURE_KEY) : null;
  return json({ acceptingEnquiries: env.ACCEPT_ENQUIRIES === '1', brochureAvailable: !!head });
}
