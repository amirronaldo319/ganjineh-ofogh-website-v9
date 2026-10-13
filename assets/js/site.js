/* Ganjineh Ofogh — site behaviour (all pages). No dependencies, no third-party requests.
   Persian is the markup language; English sits beside it in data-en / data-en-<attr> and is swapped in by setLang().
   Every feature checks that its elements exist, so one script serves all pages. */
(function () {
  'use strict';

  var root = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  var toFa = function (s) { return String(s).replace(/\d/g, function (d) { return FA_DIGITS[d]; }).replace(/\./g, '٫'); };

  var reducedMotion = reduced;
  var BASE = root.getAttribute('data-base') || '';   // '' on Persian pages, '../' on /en/ pages
  var state = { lang: root.lang === 'en' ? 'en' : 'fa', theme: root.dataset.theme === 'dusk' ? 'dusk' : 'day' };
  var towerFrame = null, resFrame = null;
  var AFTER_LANG = [];

  /* ───────── language ───────── */
  var TEXT = $$('[data-en]').filter(function (el) { return el.tagName !== 'TITLE'; });
  TEXT.forEach(function (el) { el.setAttribute('data-fa', el.innerHTML); });
  var ATTRS = ['alt', 'aria-label', 'title', 'content', 'placeholder'];
  var ATTR_EL = [];
  ATTRS.forEach(function (a) {
    $$('[data-en-' + a + ']').forEach(function (el) { el.setAttribute('data-fa-' + a, el.getAttribute(a) || ''); ATTR_EL.push([el, a]); });
  });
  var titleEl = $('title');
  var TITLE = { fa: document.title, en: (titleEl && titleEl.getAttribute('data-en')) || document.title };

  function setLang(lang, opts) {
    opts = opts || {};
    if (!opts.fromChild && opts.persist !== false && document.startViewTransition && !reducedMotion) {
      root.classList.add('vt-fade');
      var vt = document.startViewTransition(function () { applyLang(lang, opts); });
      vt.finished.then(function () { root.classList.remove('vt-fade'); }, function () { root.classList.remove('vt-fade'); });
      return;
    }
    applyLang(lang, opts);
  }
  function applyLang(lang, opts) {
    state.lang = lang === 'en' ? 'en' : 'fa';
    root.lang = state.lang; root.dir = state.lang === 'fa' ? 'rtl' : 'ltr';
    TEXT.forEach(function (el) { el.innerHTML = el.getAttribute(state.lang === 'en' ? 'data-en' : 'data-fa'); });
    ATTR_EL.forEach(function (p) {
      var el = p[0], a = p[1];
      el.setAttribute(a, el.getAttribute(state.lang === 'en' ? 'data-en-' + a : 'data-fa-' + a));
    });
    document.title = TITLE[state.lang];
    var lb = $('#lang-btn');
    if (lb) { lb.textContent = state.lang === 'fa' ? 'EN' : 'فا'; lb.lang = state.lang === 'fa' ? 'en' : 'fa'; }
    if (opts.persist !== false) store.set('ofogh-lang', state.lang);
    AFTER_LANG.forEach(function (fn) { fn(); });
    if (!opts.fromChild) { post(towerFrame, { lang: state.lang }); post(resFrame, { lang: state.lang }); }
  }
  // Each language has its own URL (/page.html, /en/page.html). Switching goes there, keeping query and hash.
  function goLanguage(lang) {
    var meta = document.querySelector('meta[name="go-alt"][data-lang="' + lang + '"]');
    store.set('ofogh-lang', lang);
    if (!meta) { setLang(lang); return; }
    location.href = new URL(meta.content, location.href).href + location.search + location.hash;
  }
  var langBtn = $('#lang-btn');
  if (langBtn) langBtn.addEventListener('click', function () { goLanguage(state.lang === 'fa' ? 'en' : 'fa'); });

  function post(frame, msg) {
    if (!frame || !frame.contentWindow) return;
    msg.src = 'ofogh-site';
    try { frame.contentWindow.postMessage(msg, '*'); } catch (e) {}
  }

  /* ───────── theme ───────── */
  function setTheme(theme, persist) {
    if (persist !== false && document.startViewTransition && !reducedMotion) {
      var btn = $('#theme-btn'), box = btn ? btn.getBoundingClientRect() : { left: innerWidth / 2, top: 0, width: 0, height: 0 };
      var x = box.left + box.width / 2, y = box.top + box.height / 2;
      root.classList.add('vt-circle');
      var t = document.startViewTransition(function () { applyTheme(theme, persist); });
      t.ready.then(function () {
        var r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        root.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + r + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 850, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' });
      }, function () {});
      t.finished.then(function () { root.classList.remove('vt-circle'); }, function () { root.classList.remove('vt-circle'); });
      return;
    }
    applyTheme(theme, persist);
  }
  function applyTheme(theme, persist) {
    state.theme = theme === 'dusk' ? 'dusk' : 'day';
    root.dataset.theme = state.theme;
    var m = $('#theme-color'); if (m) m.setAttribute('content', state.theme === 'dusk' ? '#0f1a16' : '#f2efe6');
    if (persist !== false) store.set('ofogh-site-theme', state.theme);
    post(towerFrame, { light: state.theme === 'dusk' ? 'night' : 'day' });
    post(resFrame, { theme: state.theme });
  }
  var themeBtn = $('#theme-btn');
  if (themeBtn) themeBtn.addEventListener('click', function () { setTheme(state.theme === 'dusk' ? 'day' : 'dusk'); });
  setTheme(state.theme, false);
  var themeMq = window.matchMedia && matchMedia('(prefers-color-scheme: dark)');
  if (themeMq && themeMq.addEventListener) themeMq.addEventListener('change', function (e) { if (!store.get('ofogh-site-theme')) setTheme(e.matches ? 'dusk' : 'day', false); });

  /* ───────── header + menu ───────── */
  var header = $('#header'), lastY = 0, ticking = false, menuOpen = false, userScrolled = false;
  ['wheel', 'touchmove', 'keydown'].forEach(function (type) { window.addEventListener(type, function () { userScrolled = true; }, { passive: true, once: true }); });
  function onScrollHeader() {
    if (!header) return;
    var y = window.scrollY;
    header.classList.toggle('is-stuck', y > 24);
    // A single jump of several screens is an anchor or hash landing, not reading: keep the navigation visible there.
    var jump = Math.abs(y - lastY) > 400;
    // The header only tucks away for a scroll the visitor made (wheel, touch, keys): a hash landing, layout shifts while
    // images load, or an anchor glide must never leave the navigation hidden.
    header.classList.toggle('is-hidden', userScrolled && y > 480 && y > lastY + 4 && !menuOpen && !jump);
    if (y < lastY - 4 || y < 480 || jump) header.classList.remove('is-hidden');
    lastY = y;
  }
  var menu = $('#menu'), menuBtn = $('#menu-btn'), menuFocusT;
  function setMenu(open) {
    if (!menu) return;
    menuOpen = open;
    menu.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
    clearTimeout(menuFocusT);   // a quick open→close must not let the delayed focus land on the closing menu
    if (open) menuFocusT = setTimeout(function () { var c = $('#menu-close'); if (c) c.focus(); }, 60); else menuBtn.focus({ preventScroll: true });
  }
  if (menuBtn) {
    menuBtn.addEventListener('click', function () { setMenu(true); });
    var mc = $('#menu-close'); if (mc) mc.addEventListener('click', function () { setMenu(false); });
    $$('#menu a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menuOpen) setMenu(false); });
    window.addEventListener('resize', function () { if (menuOpen && window.innerWidth >= 1200) setMenu(false); });
  }

  /* ───────── reveal + counters ───────── */
  var revealEls = $$('.rv, .rv-img');
  if ('IntersectionObserver' in window && !reduced) {
    var rvIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); rvIO.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { rvIO.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  var counters = $$('[data-count]').map(function (el) { return { el: el, target: +el.dataset.count, val: +el.dataset.count, done: false }; });
  function fmt(n) { return new Intl.NumberFormat(state.lang === 'fa' ? 'fa-IR' : 'en-US').format(Math.round(n)); }
  function paintCounters() { counters.forEach(function (c) { c.el.textContent = fmt(c.val); }); }
  AFTER_LANG.push(paintCounters);
  function runCounter(c) {
    if (c.done) return; c.done = true;
    if (reduced) { c.val = c.target; paintCounters(); return; }
    var t0 = performance.now(), dur = 1700;
    (function step(now) {
      var k = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 4);
      c.val = c.target * e; c.el.textContent = fmt(c.val);
      if (k < 1) requestAnimationFrame(step); else { c.val = c.target; c.el.textContent = fmt(c.val); }
    })(t0);
  }
  if (counters.length && 'IntersectionObserver' in window) {
    counters.forEach(function (c) { c.val = 0; c.el.textContent = fmt(0); });
    var cIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var c = counters.filter(function (x) { return x.el === e.target; })[0];
        if (c) runCounter(c); cIO.unobserve(e.target);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (c) { cIO.observe(c.el); });
  }

  /* ───────── scroll-linked: hero parallax + day→dusk ───────── */
  var heroImg = $('#hero-img'), heroSun = $('#hero-sun'), scrub = $('#daydusk');
  function onScrollFx() {
    var vh = window.innerHeight, y = window.scrollY;
    if (!reduced && heroImg && y < vh * 1.2) {
      heroImg.style.setProperty('--py', (y * 0.07).toFixed(1) + 'px');
      if (heroSun) heroSun.style.setProperty('--sy', (y * -0.12).toFixed(1) + 'px');
    }
    if (scrub) {
      var r = scrub.getBoundingClientRect();
      if (r.bottom > -vh && r.top < vh * 2) {
        var p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
        p = p * p * (3 - 2 * p);
        scrub.style.setProperty('--p', reduced ? (p > .5 ? 1 : 0) : p.toFixed(4));
      }
    }
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(function () { onScrollHeader(); onScrollFx(); ticking = false; }); }
  }, { passive: true });
  window.addEventListener('resize', onScrollFx);
  onScrollHeader(); onScrollFx();

  /* ───────── tabs ───────── */
  $$('[data-tabs]').forEach(function (group, gi) {
    var tabs = $$('.tab', group), panels = $$('.panel', group);
    tabs.forEach(function (t, i) {
      t.id = 'tab-' + gi + '-' + i; panels[i].id = 'panel-' + gi + '-' + i;
      t.setAttribute('aria-controls', panels[i].id); panels[i].setAttribute('aria-labelledby', t.id);
      t.tabIndex = i === 0 ? 0 : -1;
    });
    function select(i, focus) {
      tabs.forEach(function (t, j) {
        var on = i === j;
        t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on; panels[j].classList.toggle('is-on', on);
      });
      if (focus) tabs[i].focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i); });
      t.addEventListener('keydown', function (e) {
        var rtl = root.dir === 'rtl', n = tabs.length, j = -1;
        if (e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) j = (i + 1) % n;
        else if (e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) j = (i - 1 + n) % n;
        else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = n - 1;
        if (j >= 0) { e.preventDefault(); select(j, true); }
      });
    });
  });

  /* ───────── apartment plan explorer ───────── */
  var aptImg = $('#apt-img');
  if (aptImg) {
    var APTS = {
      1: { area: '143.25', file: 'apt1', w: 1526, h: 768, ws: [1526, 900] },
      2: { area: '150', file: 'apt2', w: 1214, h: 982, ws: [1214, 800] },
      3: { area: '166', file: 'apt3', w: 1004, h: 1206, ws: [1004, 700] },
      4: { area: '162', file: 'apt4', w: 930, h: 1246, ws: [930, 700] }
    };
    var curApt = 1;
    var paintApt = function (animate) {
      var a = APTS[curApt], fa = state.lang === 'fa';
      if (animate === true) { aptImg.classList.remove('swap'); void aptImg.offsetWidth; aptImg.classList.add('swap'); }
      aptImg.src = BASE + 'assets/img/' + a.file + '-' + a.ws[0] + '.webp';
      aptImg.srcset = a.ws.map(function (w) { return BASE + 'assets/img/' + a.file + '-' + w + '.webp ' + w + 'w'; }).join(', ');
      aptImg.width = a.w; aptImg.height = a.h;
      aptImg.alt = fa ? 'برش سه‌بعدی واحد ' + toFa(curApt) + '.' : 'Three-dimensional cut-away of Apartment ' + curApt + '.';
      $('#apt-name').textContent = fa ? 'واحد ' + toFa(curApt) + ' · سه‌خوابه' : 'Apartment ' + curApt + ' · Three bedrooms';
      $('#apt-area').innerHTML = (fa ? toFa(a.area) : a.area) + '<small>' + (fa ? 'متر مربع' : 'm²') + '</small>';
      var more = $('#apt-more'); if (more) more.href = 'residence-' + curApt + '.html';
      $$('[data-apt]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.apt === curApt)); });
    };
    $$('[data-apt]').forEach(function (b) { b.addEventListener('click', function () { curApt = +b.dataset.apt; paintApt(true); }); });
    AFTER_LANG.push(function () {
      $$('.pin').forEach(function (p) { p.textContent = state.lang === 'fa' ? toFa(p.dataset.apt) : p.dataset.apt; });
      paintApt();
    });
  }

  /* ───────── lightbox ───────── */
  var lb = $('#lb');
  if (lb) {
    var lbImg = $('#lb-img'), lbCap = $('#lb-cap'), lbList = [], lbIdx = 0, tx = null;
    var largest = function (img) {
      var ss = img.getAttribute('srcset');
      if (!ss) return img.currentSrc || img.src;
      return ss.split(',').map(function (s) { var p = s.trim().split(/\s+/); return { u: p[0], w: parseInt(p[1], 10) || 0 }; }).sort(function (a, b) { return b.w - a.w; })[0].u;
    };
    var lbShow = function (i, dir) {
      lbIdx = (i + lbList.length) % lbList.length;
      lbImg.classList.remove('swap-next', 'swap-prev');
      if (dir) { void lbImg.offsetWidth; lbImg.classList.add(dir > 0 ? 'swap-next' : 'swap-prev'); }
      var img = lbList[lbIdx];
      lbImg.src = largest(img); lbImg.alt = img.alt; lbCap.textContent = img.alt;
      $('#lb-prev').hidden = $('#lb-next').hidden = lbList.length < 2;
    };
    var lbOpen = function (img) {
      var scope = img.closest('[data-lb-scope]') || img.closest('section') || document;
      lbList = $$('[data-zoom] img, .study img, .gal figure:not([hidden]) img', scope);
      var i = lbList.indexOf(img); if (i < 0) { lbList = [img]; i = 0; }
      lbShow(i);
      if (typeof lb.showModal === 'function') lb.showModal(); else lb.setAttribute('open', '');
      document.body.style.overflow = 'hidden';
      if (window.ofoghLbAnimate) window.ofoghLbAnimate(img);
    };
    var lbClose = function () { if (lb.open) lb.close(); document.body.style.overflow = ''; };
    window.ofoghOpenLightbox = lbOpen;
    document.addEventListener('click', function (e) {
      var z = e.target.closest('[data-zoom], .study, .gal figure');
      if (z && !e.target.closest('dialog') && !e.target.closest('a')) { var im = $('img', z); if (im) lbOpen(im); }
    });
    $('#lb-close').addEventListener('click', lbClose);
    $('#lb-prev').addEventListener('click', function () { lbShow(lbIdx + (root.dir === 'rtl' ? 1 : -1), -1); });
    $('#lb-next').addEventListener('click', function () { lbShow(lbIdx + (root.dir === 'rtl' ? -1 : 1), 1); });
    lb.addEventListener('close', function () { document.body.style.overflow = ''; });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lb__stage') || e.target.classList.contains('lb__in')) lbClose(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.open) return;
      if (e.key === 'ArrowRight') lbShow(lbIdx + (root.dir === 'rtl' ? -1 : 1), root.dir === 'rtl' ? -1 : 1);
      if (e.key === 'ArrowLeft') lbShow(lbIdx + (root.dir === 'rtl' ? 1 : -1), root.dir === 'rtl' ? 1 : -1);
    });
    lb.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (tx === null) return; var dx = e.changedTouches[0].clientX - tx; tx = null;
      if (Math.abs(dx) > 50) lbShow(lbIdx + (dx < 0 ? 1 : -1) * (root.dir === 'rtl' ? -1 : 1), dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  /* ───────── gallery filter (?cat=…, ?photo=…) ───────── */
  var galFilters = $$('.filter');
  if (galFilters.length) {
    var figs = $$('.gal figure');
    var applyCat = function (cat, push) {
      galFilters.forEach(function (f) { f.setAttribute('aria-pressed', String(f.dataset.cat === cat)); });
      figs.forEach(function (f) { f.hidden = cat !== 'all' && f.dataset.cat !== cat; });
      if (push) { var u = new URL(location.href); if (cat === 'all') u.searchParams.delete('cat'); else u.searchParams.set('cat', cat); history.replaceState(null, '', u); }
    };
    galFilters.forEach(function (f) { f.addEventListener('click', function () { applyCat(f.dataset.cat, true); }); });
    var qs = new URLSearchParams(location.search);
    applyCat(galFilters.some(function (f) { return f.dataset.cat === qs.get('cat'); }) ? qs.get('cat') : 'all', false);
    var photo = qs.get('photo');
    if (photo && window.ofoghOpenLightbox) {
      var target = figs.filter(function (f) { return f.dataset.id === photo; })[0];
      if (target) { target.hidden = false; var im = $('img', target); if (im) setTimeout(function () { window.ofoghOpenLightbox(im); }, 400); }
    }
  }

  /* ───────── embedded viewers (loaded only on request) ───────── */
  var towerBox = $('#viewer');
  function launchTower() {
    if (towerFrame || !towerBox) return;
    towerFrame = document.createElement('iframe');
    towerFrame.title = state.lang === 'fa' ? 'مدل سه‌بعدی تعاملی برج گنجینه افق' : 'Interactive 3D model of the Ganjineh Ofogh tower';
    towerFrame.setAttribute('allow', 'fullscreen');
    towerFrame.src = BASE + 'tower-viewer/index.html';
    towerFrame.addEventListener('load', function () {
      var m = { lang: state.lang }; if (state.theme === 'dusk') m.light = 'night';
      post(towerFrame, m);
      towerBox.classList.add('is-live');
    });
    towerBox.appendChild(towerFrame);
    var s = $('.launch__s', towerBox); if (s) s.textContent = state.lang === 'fa' ? 'در حال بارگذاری…' : 'Loading…';
  }
  var launchBtn = $('#launch');
  if (launchBtn) launchBtn.addEventListener('click', launchTower);
  var fsBtn = $('#fs-btn');
  if (fsBtn) fsBtn.addEventListener('click', function () {
    launchTower();
    setTimeout(function () {
      if (towerBox.requestFullscreen) towerBox.requestFullscreen().catch(function () { window.open(BASE + 'tower-viewer/index.html', '_blank'); });
      else window.open(BASE + 'tower-viewer/index.html', '_blank');
    }, 0);
  });

  var resBox = $('#res3d');
  function launchRes() {
    if (resFrame || !resBox) return;
    resFrame = document.createElement('iframe');
    resFrame.title = state.lang === 'fa' ? 'مدل سه‌بعدی مبله‌ی واحدها' : 'Furnished 3D models of the apartments';
    resFrame.setAttribute('allow', 'fullscreen');
    var plan = resBox.getAttribute('data-plan') || '1';
    resFrame.src = BASE + 'residences-3d/index.html?lang=' + state.lang + '&apt=' + encodeURIComponent(plan) + '&theme=' + state.theme;
    resFrame.addEventListener('load', function () { resBox.classList.add('is-live'); });
    resBox.appendChild(resFrame);
    var s = $('.launch__s', resBox); if (s) s.textContent = state.lang === 'fa' ? 'در حال بارگذاری…' : 'Loading…';
  }
  // The tower viewer reads the page language from the link, so a new tab opens in the language being read.
  var whereLink = $('#where-link');
  if (whereLink) whereLink.href = BASE + 'tower-viewer/index.html?apt=' + whereLink.getAttribute('data-apt') + '&floor=6&lang=' + state.lang;
  var resLaunch = $('#res3d-launch');
  if (resLaunch) resLaunch.addEventListener('click', launchRes);

  window.addEventListener('message', function (e) {
    var d = e.data; if (!d || typeof d !== 'object') return;
    if (d.src === 'ofogh-viewer') {
      if (d.type === 'lang' && d.lang && d.lang !== state.lang) goLanguage(d.lang);
      if (d.type === 'ready') { var m = { lang: state.lang }; if (state.theme === 'dusk') m.light = 'night'; post(towerFrame, m); }
    }
  });

  /* ───────── copy address ───────── */
  var toastEl = $('#toast'), toastT;
  function toast(msg) { if (!toastEl) return; toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 2200); }
  var copyBtn = $('#copy-addr');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    var src = $('#visit-addr'); if (!src) return;
    var txt = src.textContent.trim();
    var ok = function () { toast(state.lang === 'fa' ? 'نشانی کپی شد.' : 'Address copied.'); };
    var fallback = function () {
      var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (err) { toast(txt); } document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, fallback); else fallback();
  });

  /* expose for the form + confirmation scripts */
  window.ofogh = { lang: function () { return state.lang; }, onLang: function (fn) { AFTER_LANG.push(fn); }, toFa: toFa };

  /* ───────── go ───────── */
  setLang(state.lang, { persist: false, fromChild: true });
  /* ───────── print this apartment ───────── */
  $$('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });
  /* ───────── share row (WhatsApp, Telegram, copy, device share sheet) ───────── */
  $$('[data-share]').forEach(function (row) {
    var url = location.href.split('#')[0], title = document.title;
    var text = encodeURIComponent(title + '\n' + url);
    var wa = $('[data-share-wa]', row), tg = $('[data-share-tg]', row), cp = $('[data-share-copy]', row), nat = $('[data-share-native]', row);
    if (wa) wa.href = 'https://wa.me/?text=' + text;
    if (tg) tg.href = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(title);
    if (cp) cp.addEventListener('click', function () {
      var done = function () { toast(state.lang === 'fa' ? 'پیوند کپی شد.' : 'Link copied.'); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, function () { window.prompt('', url); });
      else window.prompt('', url);
    });
    if (nat && navigator.share) {
      nat.hidden = false;
      nat.addEventListener('click', function () { navigator.share({ title: title, url: url }).catch(function () {}); });
    }
  });
  /* ───────── sticky sales bar (phones): after the first screens, hidden near the footer ───────── */
  (function () {
    var bar = $('[data-sticky]');
    if (!bar) return;
    var footer = $('.footer'), nearEnd = false, past = false;
    function paint() { bar.classList.toggle('is-on', past && !nearEnd); document.documentElement.classList.toggle('has-sticky', past && !nearEnd); }
    window.addEventListener('scroll', function () { var p = window.scrollY > 520; if (p !== past) { past = p; paint(); } }, { passive: true });
    if ('IntersectionObserver' in window && footer) {
      new IntersectionObserver(function (es) { nearEnd = es[0].isIntersecting; paint(); }).observe(footer);
    }
  })();
})();
