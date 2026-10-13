import { PHONE_RE, ROUTES, UNITS, clean, clientHash, json, limited, normalizeDigits, notify, sameOrigin } from './../_lib.js';

const refCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

export async function onRequestPost(context) {
  const { request, env } = context;
  if (env.ACCEPT_ENQUIRIES !== '1') return json({ error: 'پذیرش درخواست در حال حاضر فعال نیست.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'درخواست از این مبدأ پذیرفته نمی‌شود.' }, 403);
  if ((request.headers.get('content-type') || '').split(';')[0] !== 'application/json') return json({ error: 'قالب درخواست معتبر نیست.' }, 415);
  const text = await request.text();
  if (text.length < 1 || text.length > 8192) return json({ error: 'حجم درخواست معتبر نیست.' }, 413);

  const ip = await clientHash(request);
  if (await limited(env, 'enquiry', ip, 10)) return json({ error: 'درخواست‌های زیادی ثبت شده است. بعداً دوباره تلاش کنید.' }, 429);

  let data;
  try { data = JSON.parse(text); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); }
  catch { return json({ error: 'اطلاعات درخواست خوانده نشد.' }, 400); }
  if (clean(data.website)) return json({ error: 'درخواست پذیرفته نشد.' }, 400);

  const route = clean(data.route, 20);
  const name = clean(data.name, 100);
  const mobile = normalizeDigits(clean(data.mobile, 30)).replace(/\D/g, '');
  const email = clean(data.email, 200);
  const unit = clean(data['residence-interest'], 20);
  const consent = data.consent === 'yes';
  if (!ROUTES.includes(route) || !UNITS.includes(unit) || name.length < 2 || name.length > 100 || !PHONE_RE.test(mobile) || !consent)
    return json({ error: 'نام، شماره موبایل و رضایت ثبت اطلاعات را بررسی کنید.' }, 422);
  if (route === 'brochure' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'برای درخواست بروشور، ایمیل معتبر وارد کنید.' }, 422);
  const visitType = route === 'visit' ? clean(data['visit-type'], 20) : '';
  if (visitType && !['in-person', 'phone', 'video'].includes(visitType)) return json({ error: 'نوع بازدید معتبر نیست.' }, 422);
  const visitDate = route === 'visit' ? clean(data['visit-date'], 10) : '';
  const visitTime = route === 'visit' ? clean(data['visit-time'], 5) : '';
  if (visitDate && !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) return json({ error: 'تاریخ پیشنهادی معتبر نیست.' }, 422);
  if (visitTime && !/^\d{2}:\d{2}$/.test(visitTime)) return json({ error: 'ساعت پیشنهادی معتبر نیست.' }, 422);

  const reference = refCode();
  const createdAt = new Date().toISOString();
  const message = clean(data.message, 2000);
  await env.DB.prepare(
    'INSERT INTO enquiries (reference, created_at, route, name, mobile, email, unit, visit_type, visit_date, visit_time, message, page, source, campaign, consent, ip_hash) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)'
  ).bind(reference, createdAt, route, name, mobile, email, unit, visitType, visitDate, visitTime, message,
         clean(data.page, 200), clean(data.source, 100), clean(data.campaign, 100), ip).run();
  notify(context, { reference, created_at: createdAt, route, name, mobile, email, residence: unit, visit_type: visitType,
                    visit_date: visitDate, visit_time: visitTime, message, page: clean(data.page, 200) });
  return json({ reference }, 201);
}
