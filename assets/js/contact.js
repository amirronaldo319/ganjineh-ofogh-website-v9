/* Enquiry form. Requests are accepted only by a server that has intake explicitly enabled;
   this script never shows a false success. Messages follow the page language (Persian / English). */
(function () {
  'use strict';
  var form = document.getElementById('enquiry-form');
  if (!form) return;

  var L = function (fa, en) { return window.ofogh && window.ofogh.lang() === 'en' ? en : fa; };
  var routes = Array.prototype.slice.call(document.querySelectorAll('[data-route]'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('[data-route-fields]'));
  var label = form.querySelector('[data-submit-label]');
  var status = document.getElementById('form-status');
  var mobile = document.getElementById('mobile');
  var mobileError = document.getElementById('mobile-error');
  var ready = null;           // null = not yet known, true/false afterwards
  var unreachable = false;
  var busy = false;
  var currentRoute = 'visit';

  var LABELS = {
    visit: function () { return L('ارسال درخواست بازدید', 'Send viewing request'); },
    brochure: function () { return L('ارسال درخواست بروشور', 'Send brochure request'); },
    advisor: function () { return L('ارسال درخواست تماس', 'Send call-back request'); }
  };

  function setStatus(message, kind) {
    status.textContent = message;
    status.dataset.kind = kind || '';
  }
  function paintStatus() {
    if (busy) return;
    if (unreachable) setStatus(L('ثبت درخواست در این نسخه فعال نیست. برای ارسال، وب‌سایت باید به سامانه‌ی فروش متصل باشد.', 'Requests are not active in this version. The website must be connected to the sales system to send one.'), 'unavailable');
    else if (ready === true) setStatus(L('پذیرش درخواست فعال است.', 'Requests are being accepted.'), 'ready');
    else if (ready === false) setStatus(L('ثبت درخواست در حال حاضر فعال نیست. لطفاً بعداً دوباره بررسی کنید.', 'Requests are not open at the moment. Please check again later.'), 'unavailable');
    else setStatus(L('در حال بررسی امکان ارسال درخواست…', 'Checking whether requests can be submitted…'), '');
  }
  function paintLabel() { if (!busy) label.textContent = LABELS[currentRoute](); }

  function setRoute(route) {
    if (!LABELS[route]) route = 'visit';
    currentRoute = route;
    form.elements.route.value = route;
    routes.forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.route === route)); });
    groups.forEach(function (group) { group.hidden = group.dataset.routeFields !== route; });
    paintLabel();
    var email = document.getElementById('email');
    if (email) email.required = route === 'brochure';
  }
  routes.forEach(function (button) { button.addEventListener('click', function () { setRoute(button.dataset.route); }); });

  var params = new URLSearchParams(location.search);
  var select = document.getElementById('residence-interest');
  // Links from the V8 site used type-a..d; the apartments keep the same layouts under new numbers.
  var LEGACY = { 'type-a': 'residence-1', 'type-d': 'residence-2', 'type-c': 'residence-3', 'type-b': 'residence-4' };
  var requestedUnit = params.get('unit');
  if (requestedUnit && LEGACY[requestedUnit]) requestedUnit = LEGACY[requestedUnit];
  if (requestedUnit && select && Array.prototype.some.call(select.options, function (o) { return o.value === requestedUnit; })) select.value = requestedUnit;
  var intent = params.get('intent');
  if (intent === 'consult') setRoute('advisor');
  if (intent === 'brochure' || location.hash === '#brochure') setRoute('brochure');
  var footerLink = document.querySelector('[data-route-link]');
  if (footerLink) footerLink.addEventListener('click', function (event) { event.preventDefault(); setRoute('brochure'); document.getElementById('appointment').scrollIntoView(); });
  window.addEventListener('hashchange', function () { if (location.hash === '#brochure') setRoute('brochure'); });

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

  fetch('/api/status', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
    ready = !!(data && data.acceptingEnquiries);
    label.disabled = !ready;
    paintStatus();
  }).catch(function () { unreachable = true; ready = false; label.disabled = true; paintStatus(); });

  if (window.ofogh) window.ofogh.onLang(function () { paintStatus(); paintLabel(); if (mobile.value) validMobile(); });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!ready) return;
    validMobile();
    if (!form.reportValidity()) return;
    var payload = Object.fromEntries(new FormData(form).entries());
    payload.page = document.referrer ? new URL(document.referrer).pathname : location.pathname;
    payload.campaign = params.get('utm_campaign') || '';
    payload.source = params.get('utm_source') || '';
    busy = true;
    label.disabled = true;
    label.textContent = L('در حال ارسال…', 'Sending…');
    setStatus(L('در حال ثبت درخواست…', 'Recording your request…'), 'pending');
    fetch('/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(function (response) {
      return response.json().then(function (data) { return { ok: response.ok, data: data }; });
    }).then(function (result) {
      if (!result.ok) throw new Error(result.data.error || '');
      document.dispatchEvent(new CustomEvent('go:track', { detail: { event: 'lead_submitted', route: currentRoute } }));
      // replace(): Back must not return to a submitted form that could be sent twice.
      location.replace('thank-you.html?ref=' + encodeURIComponent(result.data.reference));
    }).catch(function (error) {
      busy = false;
      // Server messages are Persian; in English show a generic line unless the page is Persian.
      var msg = error.message && L(true, false) ? error.message : L('ثبت درخواست انجام نشد. دوباره تلاش کنید.', 'The request could not be recorded. Please try again.');
      setStatus(msg, 'error');
      label.disabled = false;
      paintLabel();
    });
  });

  paintLabel();
  paintStatus();
})();
