/* Compare two apartments. All four columns are in the page; this shows the two that are picked,
   says how they differ, and keeps the choice in the address so it can be shared. */
(function () {
  'use strict';
  var root = document.querySelector('[data-compare]');
  if (!root) return;
  var L = function (fa, en) { return window.ofogh && window.ofogh.lang() === 'en' ? en : fa; };
  var a = document.getElementById('cmp-a'), b = document.getElementById('cmp-b'), diff = document.getElementById('cmp-diff');
  var table = document.getElementById('cmp-table');
  var cells = Array.prototype.slice.call(table.querySelectorAll('[data-apt]'));
  var FA = '۰۱۲۳۴۵۶۷۸۹';
  var num = function (n, max, min) {
    return n.toLocaleString(L('fa-IR', 'en-US'), { minimumFractionDigits: min === undefined ? max || 0 : min, maximumFractionDigits: max || 0 });
  };
  var AREA = {};
  cells.forEach(function (c) { if (c.dataset.area) AREA[c.dataset.apt] = parseFloat(c.dataset.area); });

  function valid(v) { return /^[1-4]$/.test(v || ''); }
  function paint() {
    var x = a.value, y = b.value;
    cells.forEach(function (c) { c.hidden = c.dataset.apt !== x && c.dataset.apt !== y; });
    table.classList.toggle('is-single', x === y);
    var ax = AREA[x], ay = AREA[y];
    if (x === y) {
      diff.textContent = L('یک واحد را دوبار انتخاب کرده‌اید؛ برای مقایسه، واحد دوم را تغییر دهید.', 'You picked the same apartment twice; change the second one to compare.');
    } else if (ax === ay) {
      diff.textContent = L('مساحت این دو واحد برابر است.', 'The two apartments have the same area.');
    } else {
      var big = ax > ay ? x : y, small = ax > ay ? y : x, d = Math.abs(ax - ay), pct = d / AREA[small] * 100;
      var dd = d % 1 ? 2 : 0;
      diff.textContent = L('واحد ' + num(+big) + ' ' + num(d, dd) + ' متر مربع (' + num(pct, 1, 0) + '٪) از واحد ' + num(+small) + ' بزرگ‌تر است.',
                           'Apartment ' + big + ' is ' + num(d, dd) + ' m² (' + num(pct, 1, 0) + '%) larger than Apartment ' + small + '.');
    }
    var q = new URLSearchParams(location.search); q.set('a', x); q.set('b', y);
    try { history.replaceState(null, '', location.pathname + '?' + q.toString() + location.hash); } catch (e) {}
  }

  var params = new URLSearchParams(location.search);
  if (valid(params.get('a'))) a.value = params.get('a');
  if (valid(params.get('b'))) b.value = params.get('b');
  a.addEventListener('change', paint);
  b.addEventListener('change', paint);
  if (window.ofogh) window.ofogh.onLang(paint);
  paint();
})();
