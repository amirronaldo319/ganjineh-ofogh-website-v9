/* Ganjineh Ofogh — motion layer. Everything here is decoration: the site works without it,
   and none of it runs when the visitor prefers reduced motion. Only transform/opacity/clip-path are animated. */
(function () {
  'use strict';
  var root = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var finePointer = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var hasIO = 'IntersectionObserver' in window;

  /* ───────── images fade up as they decode (CSS keeps them visible without JS or under reduced motion) ───────── */
  function watchImages() {
    $$('img[loading="lazy"]').forEach(function (img) {
      if (img.classList.contains('is-loaded')) return;
      if (img.complete && img.naturalWidth) { img.classList.add('is-loaded'); return; }
      var done = function () { img.classList.add('is-loaded'); };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }
  watchImages();
  setTimeout(function () { $$('img[loading="lazy"]:not(.is-loaded)').forEach(function (i) { if (i.complete) i.classList.add('is-loaded'); }); }, 6000);
  // Reduced motion or lite mode (slow connection / Data Saver, decided in <head>): none of the decorative layers run.
  if (reduced || root.dataset.lite) { return; }

  /* ───────── scroll progress hairline in the header ───────── */
  var header = $('#header');
  var bar = null;
  if (header) {
    bar = document.createElement('span');
    bar.className = 'progress'; bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<i></i>';
    header.appendChild(bar);
  }

  /* ───────── headlines: words rise out of a mask ───────── */
  var SPLIT = '.h2, .phero .display, .visit .display, .quote';
  var splitEls = $$(SPLIT).filter(function (el) { return !el.closest('.hero__title'); });
  function split(el) {
    var n = 0;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (t) { return t.parentNode.closest('.sw') || !t.nodeValue.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
    });
    var nodes = [];
    for (var t = walker.nextNode(); t; t = walker.nextNode()) nodes.push(t);
    nodes.forEach(function (node) {
      var frag = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (tok) {
        if (!tok) return;
        if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(tok)); return; }
        var w = document.createElement('span'); w.className = 'sw';
        var i = document.createElement('i'); i.style.setProperty('--wi', n++); i.textContent = tok;
        w.appendChild(i); frag.appendChild(w);
      });
      node.parentNode.replaceChild(frag, node);
    });
    el.setAttribute('data-split', '1');
  }
  var wordIO = hasIO ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('sw-on'); wordIO.unobserve(e.target); } });
  }, { threshold: 0.4, rootMargin: '0px 0px -8% 0px' }) : null;
  function initSplit(el) {
    split(el);
    if (wordIO) wordIO.observe(el); else el.classList.add('sw-on');
  }
  splitEls.forEach(initSplit);

  // A language change replaces the text; split it again and let the words rise once more.
  if (window.ofogh && window.ofogh.onLang) {
    window.ofogh.onLang(function () {
      splitEls.forEach(function (el) {
        var wasOn = el.classList.contains('sw-on');
        el.classList.remove('sw-on');
        split(el);
        if (wasOn) requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('sw-on'); }); });
        else if (wordIO) wordIO.observe(el);
      });
      watchImages();
    });
  }

  /* ───────── hero: the arch and sun lean toward the pointer ───────── */
  var heroEl = $('.hero') || $('.phero');
  if (heroEl && finePointer) {
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    var tick = function () {
      cx += (tx - cx) * 0.075; cy += (ty - cy) * 0.075;
      heroEl.style.setProperty('--mx', cx.toFixed(3)); heroEl.style.setProperty('--my', cy.toFixed(3));
      raf = (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) ? requestAnimationFrame(tick) : 0;
    };
    heroEl.addEventListener('pointermove', function (e) {
      var r = heroEl.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    heroEl.addEventListener('pointerleave', function () { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); });
  }

  /* ───────── scroll parallax: images drift inside their frames ───────── */
  var plx = [];
  $$('.bleed > img, .bleed > picture > img').forEach(function (img) { img.classList.add('plx'); plx.push({ host: img.closest('.bleed'), el: img, k: 0.085, vis: false }); });
  $$('.split .frame, .intro__media .frame, .crown .frame, .exp__aside .frame, .arrival .frame, .mosaic .frame').forEach(function (f) {
    f.classList.add('plx'); plx.push({ host: f, el: f, k: 0.055, vis: false });
  });
  var plxIO = hasIO ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var t = plx.filter(function (p) { return p.host === e.target; })[0];
      if (t) t.vis = e.isIntersecting;
    });
    schedule();
  }, { rootMargin: '10% 0px' }) : null;
  plx.forEach(function (p) { if (plxIO) plxIO.observe(p.host); else p.vis = true; });

  /* ───────── map roads, plan pins: give the CSS something to hang on ───────── */
  $$('.map .road path').forEach(function (p, i) { p.setAttribute('pathLength', '1'); p.style.setProperty('--ri', i); });
  $$('.plan .pin').forEach(function (p, i) { p.style.setProperty('--pi', i); });
  var simple = $$('.plan, .footer__mark');
  if (hasIO) {
    var sIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); sIO.unobserve(e.target); } });
    }, { threshold: 0.25 });
    simple.forEach(function (el) { sIO.observe(el); });
  } else simple.forEach(function (el) { el.classList.add('in'); });


  /* ═══════════ second layer ═══════════ */

  /* ───────── intro curtain: let anyone skip it ───────── */
  var intro = $('#intro');
  if (root.hasAttribute('data-intro') && intro) {
    var endIntro = function () {
      root.classList.add('intro-skip');
      setTimeout(function () { root.removeAttribute('data-intro'); if (intro.parentNode) intro.parentNode.removeChild(intro); }, 600);
    };
    var autoEnd = setTimeout(function () { root.removeAttribute('data-intro'); if (intro.parentNode) intro.parentNode.removeChild(intro); }, 3300);
    ['pointerdown', 'keydown', 'wheel'].forEach(function (ev) {
      window.addEventListener(ev, function once() { clearTimeout(autoEnd); endIntro(); window.removeEventListener(ev, once); }, { passive: true });
    });
  } else if (intro && intro.parentNode) intro.parentNode.removeChild(intro);

  /* ───────── cursor ring ───────── */
  var cursor = $('#cursor');
  if (cursor && finePointer && getComputedStyle(cursor).display !== 'none') {
    var ring = { x: -100, y: -100, tx: -100, ty: -100 }, label = $('b', cursor), crAF = 0;
    var VIEW = '[data-zoom], .gal figure, .study, .card .frame, .mosaic figure, .plan .pin';
    var LINK = 'a, button, summary, [role="tab"], label, select, .filter';
    var TEXT = 'input, textarea';
    var loop = function () {
      ring.x += (ring.tx - ring.x) * 0.2; ring.y += (ring.ty - ring.y) * 0.2;
      cursor.style.transform = 'translate3d(' + ring.x.toFixed(1) + 'px,' + ring.y.toFixed(1) + 'px,0)';
      crAF = (Math.abs(ring.tx - ring.x) + Math.abs(ring.ty - ring.y) > 0.3) ? requestAnimationFrame(loop) : 0;
    };
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      ring.tx = e.clientX; ring.ty = e.clientY;
      if (!cursor.classList.contains('on')) { ring.x = ring.tx; ring.y = ring.ty; cursor.classList.add('on'); }
      var el = e.target.closest ? e.target : null;
      var view = el && el.closest(VIEW), link = el && el.closest(LINK), text = el && el.closest(TEXT);
      cursor.classList.toggle('view', !!view && !text);
      cursor.classList.toggle('link', !!link && !view && !text);
      cursor.classList.toggle('text', !!text);
      if (view) {
        var pin = el.closest('.plan .pin');
        label.textContent = pin ? (root.lang === 'en' ? 'Select' : 'انتخاب') : (root.lang === 'en' ? 'View' : 'مشاهده');
      }
      if (!crAF) crAF = requestAnimationFrame(loop);
    }, { passive: true });
    document.addEventListener('pointerdown', function () { cursor.classList.add('down'); });
    document.addEventListener('pointerup', function () { cursor.classList.remove('down'); });
    document.documentElement.addEventListener('mouseleave', function () { cursor.classList.remove('on'); });
  }

  /* ───────── nav: a single hairline glides between links ───────── */
  var nav = $('.nav');
  if (nav) {
    var ind = document.createElement('span'); ind.className = 'nav__ind'; nav.appendChild(ind);
    nav.classList.add('has-ind');
    var links = $$('a:not(.cta)', nav);
    var move = function (a) {
      if (!a) { ind.style.opacity = 0; return; }
      var n = nav.getBoundingClientRect(), r = a.getBoundingClientRect();
      ind.style.width = r.width + 'px'; ind.style.transform = 'translateX(' + (r.left - n.left) + 'px)'; ind.style.opacity = 1;
    };
    var current = function () { return $('a[aria-current="page"]:not(.cta)', nav); };
    links.forEach(function (a) { a.addEventListener('pointerenter', function () { move(a); }); a.addEventListener('focus', function () { move(a); }); });
    nav.addEventListener('pointerleave', function () { move(current()); });
    window.addEventListener('resize', function () { move(current()); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { move(current()); });
    move(current());
    if (window.ofogh && window.ofogh.onLang) window.ofogh.onLang(function () { setTimeout(function () { move(current()); }, 60); });
  }

  /* ───────── apartment cards tilt ───────── */
  if (finePointer) {
    $$('.apt-card').forEach(function (card) {
      var f = $('.frame', card);
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        f.style.setProperty('--tx', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
        f.style.setProperty('--ty', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
      });
      card.addEventListener('pointerleave', function () { f.style.setProperty('--tx', 0); f.style.setProperty('--ty', 0); });
    });
  }

  /* ───────── section dots (home) ───────── */
  var dots = $('.dots');
  if (dots && hasIO) {
    var dotLinks = $$('a[data-dot]', dots);
    var map = {};
    dotLinks.forEach(function (a) { var s = document.getElementById(a.getAttribute('data-dot')); if (s) map[s.id] = { a: a, s: s }; });
    var darkIds = { daydusk: 1, visit: 1 };
    var dIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        dotLinks.forEach(function (a) { a.classList.toggle('is-on', a === map[e.target.id].a); });
        dots.classList.toggle('on-dark', !!darkIds[e.target.id]);
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { dIO.observe(map[id].s); });
  }

  /* ───────── marquee drifts faster while you scroll ───────── */
  var track = $('.marquee__track');
  if (track && track.getAnimations) {
    var lastY = window.scrollY, rate = 1, mq = 0;
    var spin = function () {
      var a = track.getAnimations()[0];
      if (!a) { mq = 0; return; }
      rate += (1 - rate) * 0.04;
      a.updatePlaybackRate(rate);
      mq = rate > 1.02 ? requestAnimationFrame(spin) : 0;
      if (!mq) a.updatePlaybackRate(1);
    };
    window.addEventListener('scroll', function () {
      var v = Math.abs(window.scrollY - lastY); lastY = window.scrollY;
      rate = clamp(rate + v * 0.045, 1, 7);
      if (!mq) mq = requestAnimationFrame(spin);
    }, { passive: true });
  }

  /* ───────── in-page links glide with a long, even ease ───────── */
  var gliding = false;
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var id = a.getAttribute('href').slice(1);
    var target = id ? document.getElementById(id) : document.body;
    if (!target) return;
    e.preventDefault();
    var off = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    var from = window.scrollY, to = id ? Math.max(0, target.getBoundingClientRect().top + from - off) : 0;
    var dist = to - from, dur = clamp(Math.abs(dist) * 0.55, 600, 1500), t0 = performance.now();
    root.style.scrollBehavior = 'auto'; gliding = true;
    var ease = function (k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
    var stop = function () { gliding = false; };
    window.addEventListener('wheel', stop, { once: true, passive: true });
    window.addEventListener('touchstart', stop, { once: true, passive: true });
    (function step(now) {
      if (!gliding) { root.style.scrollBehavior = ''; return; }
      var k = clamp((now - t0) / dur, 0, 1);
      window.scrollTo(0, from + dist * ease(k));
      if (k < 1) requestAnimationFrame(step); else { gliding = false; root.style.scrollBehavior = ''; if (id) history.replaceState(null, '', '#' + id); }
    })(t0);
  });

  /* ───────── image wipes alternate direction ───────── */
  var wipeDirs = ['', 's', 'e'], wi = 0;
  $$('.rv-img').forEach(function (el) { var d = wipeDirs[wi++ % 3]; if (d) el.setAttribute('data-wipe', d); });

  /* ───────── one rAF loop for scroll-driven values ───────── */
  var queued = false;
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(frame); } }
  function frame() {
    queued = false;
    var vh = window.innerHeight, y = window.scrollY, doc = root.scrollHeight - vh;
    if (bar) bar.style.setProperty('--sp', doc > 0 ? clamp(y / doc, 0, 1).toFixed(4) : 0);
    plx.forEach(function (p) {
      if (!p.vis) return;
      var r = p.host.getBoundingClientRect();
      var prog = clamp(((r.top + r.height / 2) - vh / 2) / (vh / 2 + r.height / 2), -1, 1);
      p.el.style.setProperty('--plx', (-prog * p.k * r.height).toFixed(1) + 'px');
    });
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  schedule();

  /* ───────── buttons lean toward the cursor ───────── */
  if (finePointer) {
    $$('.btn').forEach(function (b) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width, dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        b.style.translate = (dx * 8).toFixed(1) + 'px ' + (dy * 6).toFixed(1) + 'px';
      });
      b.addEventListener('pointerleave', function () { b.style.translate = ''; });
    });
  }

  /* ───────── gallery: filtered tiles arrive in sequence ───────── */
  $$('.filter').forEach(function (f) {
    f.addEventListener('click', function () {
      setTimeout(function () {
        $$('.gal figure:not([hidden])').forEach(function (fig, i) {
          fig.classList.remove('gal-in'); void fig.offsetWidth;
          fig.style.setProperty('--gi', Math.min(i, 16)); fig.classList.add('gal-in');
        });
      }, 0);
    });
  });

  /* ───────── lightbox: the picture grows out of the thumbnail you pressed ───────── */
  window.ofoghLbAnimate = function (src) {
    var img = $('#lb-img');
    if (!img || !src || !img.animate) return;
    var go = function () {
      var a = src.getBoundingClientRect(), b = img.getBoundingClientRect();
      if (!a.width || !b.width) return;
      var dx = (a.left + a.width / 2) - (b.left + b.width / 2), dy = (a.top + a.height / 2) - (b.top + b.height / 2);
      var s = Math.max(a.width / b.width, a.height / b.height);
      img.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')', opacity: 0.6 }, { transform: 'none', opacity: 1 }],
        { duration: 620, easing: 'cubic-bezier(.16,1,.3,1)' });
    };
    if (img.decode) img.decode().then(go, go); else go();
  };

  /* ───────── layer III: adaptive header, back-to-top ring, pointer spotlight ───────── */
  // The header turns light-on-dark while it sits over a dark band (day theme).
  (function () {
    if (!header || !hasIO) return;
    var dark = $$('.scrub, .visit, .footer, [data-tone="dark"]');
    if (!dark.length) return;
    var over = new Set();
    var apply = function () {
      header.classList.toggle('is-dark', over.size > 0);
      header.classList.toggle('is-scrub', Array.from(over).some(function (el) { return el.classList.contains('scrub'); }));
    };
    var io = null;
    function observe() {
      if (io) io.disconnect();
      over.clear();
      var h = header.offsetHeight || 72;
      // a one-pixel line through the middle of the header
      io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) over.add(e.target); else over.delete(e.target); });
        apply();
      }, { rootMargin: '-' + Math.floor(h / 2) + 'px 0px -' + Math.max(0, window.innerHeight - Math.floor(h / 2) - 1) + 'px 0px', threshold: 0 });
      dark.forEach(function (el) { io.observe(el); });
    }
    observe();
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(observe, 200); });
  })();

  (function () {
    var label = root.lang === 'fa' ? 'بازگشت به بالای صفحه' : 'Back to top';
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'totop'; b.setAttribute('aria-label', label); b.tabIndex = -1;
    b.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle class="ring-bg" cx="20" cy="20" r="18"/><circle class="ring" cx="20" cy="20" r="18"/></svg>' +
      '<span class="arrow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></span>';
    document.body.appendChild(b);
    var on = false, ticking = false;
    function update() {
      ticking = false;
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      var y = window.scrollY;
      b.style.setProperty('--read', clamp(y / max, 0, 1).toFixed(3));
      var show = y > 700;
      if (show !== on) { on = show; b.classList.toggle('is-on', show); b.tabIndex = show ? 0 : -1; }
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    b.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    update();
  })();

  if (finePointer) {
    $$('.visit').forEach(function (band) {
      var raf = 0, x = 0, y = 0;
      band.addEventListener('pointermove', function (e) {
        var r = band.getBoundingClientRect(); x = e.clientX - r.left; y = e.clientY - r.top;
        if (!raf) raf = requestAnimationFrame(function () { raf = 0; band.style.setProperty('--sx', x + 'px'); band.style.setProperty('--sy', y + 'px'); band.classList.add('is-lit'); });
      });
      band.addEventListener('pointerleave', function () { band.classList.remove('is-lit'); });
    });
  }

  /* ───────── layer IV: stars at dusk, drifting specks in dark bands, button ripples ───────── */
  function seeded(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function scatter(host, cls, count, make, seed) {
    if (!host || $('.' + cls, host)) return;
    var rnd = seeded(seed), box = document.createElement('span');
    box.className = cls; box.setAttribute('aria-hidden', 'true');
    for (var n = 0; n < count; n++) { var el = document.createElement('i'); make(el, rnd); box.appendChild(el); }
    host.insertBefore(box, host.firstChild);
  }
  var lowPower = (navigator.hardwareConcurrency || 8) <= 4;
  function dressSky() {
    var hero = $('.hero');
    var dusk = root.getAttribute('data-theme') === 'dusk';
    var existing = hero && $('.stars', hero);
    if (!hero) return;
    if (!dusk && existing) { existing.remove(); return; }
    if (dusk) scatter(hero, 'stars', lowPower ? 18 : 38, function (el, r) {
      el.style.left = (r() * 100).toFixed(1) + '%'; el.style.top = (r() * 70).toFixed(1) + '%';
      el.style.setProperty('--t', (3 + r() * 4).toFixed(1) + 's'); el.style.setProperty('--dl', (r() * 5).toFixed(1) + 's'); el.style.setProperty('--o', (.35 + r() * .5).toFixed(2));
    }, 7);
  }
  dressSky();
  new MutationObserver(dressSky).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  $$('.visit').forEach(function (band, k) {
    scatter(band, 'motes', lowPower ? 8 : 16, function (el, r) {
      el.style.left = (r() * 100).toFixed(1) + '%';
      el.style.setProperty('--s', (2 + r() * 3).toFixed(1) + 'px'); el.style.setProperty('--t', (14 + r() * 14).toFixed(1) + 's');
      el.style.setProperty('--dl', (-r() * 20).toFixed(1) + 's'); el.style.setProperty('--dx', ((r() - .5) * 90).toFixed(0) + 'px');
    }, 11 + k);
  });

  // the gleam across the hero's Latin wordmark (Web Animations: independent of the entrance animation on the same element)
  var mark = $('.hero__title .en');
  if (mark && mark.animate) {
    mark.animate([{ backgroundPosition: '130% 0' }, { backgroundPosition: '-30% 0' }],
      { duration: 2600, delay: 3400, endDelay: 7000, iterations: Infinity, easing: 'cubic-bezier(.65,0,.35,1)' });
  }

  document.addEventListener('pointerdown', function (e) {
    var btn = e.target.closest && e.target.closest('.btn');
    if (!btn || btn.disabled) return;
    var r = btn.getBoundingClientRect(), dot = document.createElement('span');
    dot.className = 'ripple'; dot.setAttribute('aria-hidden', 'true');
    dot.style.setProperty('--rx', (e.clientX - r.left) + 'px'); dot.style.setProperty('--ry', (e.clientY - r.top) + 'px');
    btn.appendChild(dot);
    setTimeout(function () { dot.remove(); }, 750);
  }, { passive: true });
})();
