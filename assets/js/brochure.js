/* Brochure request: a name and a mobile number, then the thank-you page offers the PDF.
   Never shows a false success; the submit stays disabled until the server says it is accepting requests. */
(function () {
  'use strict';
  var form = document.getElementById('brochure-form');
  if (!form) return;

  var L = function (fa, en) { return window.ofogh && window.ofogh.lang() === 'en' ? en : fa; };
  var label = form.querySelector('[data-submit-label]');
  var status = document.getElementById('form-status');
  var mobile = document.getElementById('mobile');
  var mobileError = document.getElementById('mobile-error');
  var ready = null, unreachable = false, busy = false, hasPdf = false;

  function setStatus(message, kind) { status.textContent = message; status.dataset.kind = kind || ''; }
  function paintStatus() {
    if (busy) return;
    if (ready === false && window.ofogh.mailFallback) window.ofogh.mailFallback(form, L('درخواست بروشور', 'Brochure request'));
    if (unreachable) setStatus(L('ثبت درخواست در این نسخه فعال نیست. برای ارسال، وب‌سایت باید به سامانه‌ی فروش متصل باشد.', 'Requests are not active in this version. The site must be connected to the sales system to send one.'), 'error');
    else if (ready === true) setStatus(hasPdf ? L('بروشور پس از ثبت، همین‌جا برای دانلود آماده می‌شود.', 'The brochure will be ready to download here as soon as you send this.')
                                               : L('فایل بروشور هنوز در وب‌سایت بارگذاری نشده است؛ پس از ثبت، تیم فروش آن را برای شما می‌فرستد.', 'The brochure file is not on the website yet; once you send this, the sales team will send it to you.'), 'ready');
    else if (ready === false) setStatus(L('ثبت درخواست در حال حاضر فعال نیست. لطفاً بعداً دوباره بررسی کنید.', 'Requests are not open at the moment. Please check again later.'), 'error');
    else setStatus(L('در حال بررسی امکان ارسال درخواست…', 'Checking whether requests can be submitted…'), '');
  }
  function paintLabel() {
    if (busy) return;
    label.textContent = hasPdf ? L('دریافت بروشور', 'Get the brochure') : L('درخواست بروشور', 'Request the brochure');
  }
  function paintWhen() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-when]'), function (el) { el.hidden = (el.dataset.when === 'available') !== hasPdf; });
  }

  function validMobile() {
    var digits = mobile.value
      .replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); })
      .replace(/\D/g, '');
    var valid = /^0?9\d{9}$/.test(digits) || /^989\d{9}$/.test(digits);
    mobile.setCustomValidity(valid || !mobile.value ? '' : L('شماره موبایل معتبر وارد کنید.', 'Enter a valid mobile number.'));
    mobileError.textContent = mobile.validationMessage;
    return valid;
  }
  mobile.addEventListener('input', validMobile);

  var params = new URLSearchParams(location.search);
  var select = document.getElementById('residence-interest');
  var unit = params.get('unit');
  if (unit && select && Array.prototype.some.call(select.options, function (o) { return o.value === unit; })) select.value = unit;

  fetch(window.ofogh.api('status'), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
    ready = !!(data && data.acceptingEnquiries);
    hasPdf = !!(data && data.brochureAvailable);
    label.disabled = !ready;
    paintStatus(); paintLabel(); paintWhen();
  }).catch(function () { unreachable = true; ready = false; label.disabled = true; paintStatus(); });

  if (window.ofogh) window.ofogh.onLang(function () { paintStatus(); paintLabel(); if (mobile.value) validMobile(); });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!ready) return;
    validMobile();
    if (!form.reportValidity()) return;
    var payload = Object.fromEntries(new FormData(form).entries());
    payload.campaign = params.get('utm_campaign') || '';
    payload.source = params.get('utm_source') || '';
    busy = true;
    label.disabled = true;
    label.textContent = L('در حال ارسال…', 'Sending…');
    setStatus(L('در حال ثبت درخواست…', 'Recording your request…'), 'pending');
    fetch(window.ofogh.api('enquiries'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(function (response) {
      return response.json().then(function (data) { return { ok: response.ok, data: data }; });
    }).then(function (result) {
      if (!result.ok) throw new Error(result.data.error || '');
      document.dispatchEvent(new CustomEvent('go:track', { detail: { event: 'lead_submitted', route: 'download' } }));
      location.replace('thank-you.html?ref=' + encodeURIComponent(result.data.reference));
    }).catch(function (error) {
      busy = false;
      setStatus(error.message && L(true, false) ? error.message : L('ثبت درخواست انجام نشد. دوباره تلاش کنید.', 'The request could not be recorded. Please try again.'), 'error');
      label.disabled = false;
      paintLabel();
    });
  });

  paintLabel(); paintStatus(); paintWhen();
})();
