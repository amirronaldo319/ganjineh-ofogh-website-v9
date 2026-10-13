/* Jalali (Solar Hijri) date picker for the viewing request, shown on the Persian pages only.
   The form still submits an ISO Gregorian date (YYYY-MM-DD) in the original field, which the server validates.
   Conversion uses the standard 33-year-cycle arithmetic (as in jdf / jalaali-js) and is checked against known Nowruz dates. */
(function () {
  'use strict';
  var JM = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  var WD = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];                     // Saturday first
  var WDF = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  var FA = '۰۱۲۳۴۵۶۷۸۹';
  var fa = function (n) { return String(n).replace(/\d/g, function (d) { return FA[d]; }); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var div = function (a, b) { return ~~(a / b); };

  function g2j(gy, gm, gd) {
    var gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var jy = gy <= 1600 ? 0 : 979; gy -= gy <= 1600 ? 621 : 1600;
    var gy2 = gm > 2 ? gy + 1 : gy;
    var days = 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + gdm[gm - 1];
    jy += 33 * div(days, 12053); days %= 12053;
    jy += 4 * div(days, 1461); days %= 1461;
    if (days > 365) { jy += div(days - 1, 365); days = (days - 1) % 365; }
    var jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
    var jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return [jy, jm, jd];
  }
  function j2g(jy, jm, jd) {
    var gy = jy <= 979 ? 621 : 1600; jy -= jy <= 979 ? 0 : 979;
    var days = 365 * jy + div(jy, 33) * 8 + div((jy % 33) + 3, 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
    gy += 400 * div(days, 146097); days %= 146097;
    if (days > 36524) { gy += 100 * div(--days, 36524); days %= 36524; if (days >= 365) days++; }
    gy += 4 * div(days, 1461); days %= 1461;
    if (days > 365) { gy += div(days - 1, 365); days = (days - 1) % 365; }
    var gd = days + 1;
    var sal = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var gm = 0;
    for (; gm < 13; gm++) { if (gd <= sal[gm]) break; gd -= sal[gm]; }
    return [gy, gm, gd];
  }
  function monthLen(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    var g = j2g(jy, 12, 30), back = g2j(g[0], g[1], g[2]);
    return back[0] === jy && back[1] === 12 && back[2] === 30 ? 30 : 29;
  }
  function weekday(jy, jm, jd) {                                      // 0 = Saturday
    var g = j2g(jy, jm, jd);
    return (new Date(g[0], g[1] - 1, g[2]).getDay() + 1) % 7;
  }
  window.OfoghJalali = { toJalali: g2j, toGregorian: j2g, monthLength: monthLen };

  if (document.documentElement.lang !== 'fa') return;
  var field = document.getElementById('visit-date');
  if (!field) return;

  var today = new Date(), tj = g2j(today.getFullYear(), today.getMonth() + 1, today.getDate());
  var limit = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
  var picked = null;                                                   // [jy, jm, jd]
  var view = { y: tj[0], m: tj[1] };

  var wrap = document.createElement('div'); wrap.className = 'jdate';
  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'jdate__btn';
  btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
  var pop = document.createElement('div'); pop.className = 'jdate__pop'; pop.hidden = true; pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'انتخاب تاریخ شمسی');
  field.type = 'hidden';
  field.parentNode.insertBefore(wrap, field);
  wrap.appendChild(btn); wrap.appendChild(pop);
  var label = document.querySelector('label[for="visit-date"]');
  if (label) { label.removeAttribute('for'); btn.id = 'visit-date-btn'; label.setAttribute('for', 'visit-date-btn'); }

  function paintBtn() {
    btn.textContent = picked ? WDF[weekday(picked[0], picked[1], picked[2])] + '، ' + fa(picked[2]) + ' ' + JM[picked[1] - 1] + ' ' + fa(picked[0]) : 'انتخاب تاریخ';
    btn.classList.toggle('is-empty', !picked);
  }
  function inRange(jy, jm, jd) {
    var g = j2g(jy, jm, jd), d = new Date(g[0], g[1] - 1, g[2]), t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return d >= t0 && d <= limit;
  }
  function render() {
    pop.textContent = '';
    var head = document.createElement('div'); head.className = 'jdate__head';
    var prev = document.createElement('button'); prev.type = 'button'; prev.setAttribute('aria-label', 'ماه قبل'); prev.textContent = '›';
    var next = document.createElement('button'); next.type = 'button'; next.setAttribute('aria-label', 'ماه بعد'); next.textContent = '‹';
    var title = document.createElement('strong'); title.setAttribute('aria-live', 'polite'); title.textContent = JM[view.m - 1] + ' ' + fa(view.y);
    prev.addEventListener('click', function () { view.m--; if (view.m < 1) { view.m = 12; view.y--; } render(); });
    next.addEventListener('click', function () { view.m++; if (view.m > 12) { view.m = 1; view.y++; } render(); });
    head.appendChild(prev); head.appendChild(title); head.appendChild(next); pop.appendChild(head);
    var grid = document.createElement('div'); grid.className = 'jdate__grid'; grid.setAttribute('role', 'grid');
    WD.forEach(function (w, i) { var c = document.createElement('span'); c.className = 'jdate__wd'; c.textContent = w; c.setAttribute('aria-label', WDF[i]); grid.appendChild(c); });
    var first = weekday(view.y, view.m, 1), len = monthLen(view.y, view.m);
    for (var i = 0; i < first; i++) grid.appendChild(document.createElement('span'));
    for (var d = 1; d <= len; d++) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'jdate__d'; b.textContent = fa(d); b.dataset.d = d;
      b.setAttribute('aria-label', WDF[weekday(view.y, view.m, d)] + ' ' + fa(d) + ' ' + JM[view.m - 1] + ' ' + fa(view.y));
      var ok = inRange(view.y, view.m, d);
      if (!ok) { b.disabled = true; }
      if (picked && picked[0] === view.y && picked[1] === view.m && picked[2] === d) { b.classList.add('is-picked'); b.setAttribute('aria-pressed', 'true'); }
      if (tj[0] === view.y && tj[1] === view.m && tj[2] === d) b.classList.add('is-today');
      grid.appendChild(b);
    }
    pop.appendChild(grid);
    var foot = document.createElement('div'); foot.className = 'jdate__foot';
    var clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'پاک کردن';
    clear.addEventListener('click', function () { picked = null; field.value = ''; paintBtn(); close(true); });
    foot.appendChild(clear); pop.appendChild(foot);
  }
  function choose(d) {
    picked = [view.y, view.m, d];
    var g = j2g(view.y, view.m, d);
    field.value = g[0] + '-' + pad(g[1]) + '-' + pad(g[2]);
    field.dispatchEvent(new Event('change', { bubbles: true }));
    paintBtn(); close(true);
  }
  function open() {
    if (picked) { view.y = picked[0]; view.m = picked[1]; } else { view.y = tj[0]; view.m = tj[1]; }
    render(); pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
    var f = pop.querySelector('.is-picked') || pop.querySelector('.is-today:not(:disabled)') || pop.querySelector('.jdate__d:not(:disabled)');
    if (f) f.focus();
  }
  function close(refocus) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus(); }

  btn.addEventListener('click', function () { if (pop.hidden) open(); else close(false); });
  pop.addEventListener('click', function (e) { var t = e.target.closest('.jdate__d'); if (t && !t.disabled) choose(+t.dataset.d); });
  pop.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    var t = e.target.closest && e.target.closest('.jdate__d');
    if (!t) return;
    var cells = Array.prototype.slice.call(pop.querySelectorAll('.jdate__d:not(:disabled)'));
    var i = cells.indexOf(t), step = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];   // RTL: left is later
    if (step === undefined) return;
    e.preventDefault();
    var n = cells[i + step]; if (n) n.focus();
  });
  document.addEventListener('click', function (e) { if (!pop.hidden && !wrap.contains(e.target)) close(false); });
  paintBtn();
})();
