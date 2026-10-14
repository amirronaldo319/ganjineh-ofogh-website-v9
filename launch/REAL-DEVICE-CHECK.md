# Real-device check (15 minutes, one phone is enough)

Everything measured so far was on a Mac with CPU throttling. This is the part only a real phone can answer:
does scrolling feel smooth, and do the 3D viewers hold up on a mid-range GPU?

Use the live link: https://amirronaldo319.github.io/ganjineh-ofogh/en/index.html  (Persian: drop `/en`)
Use a normal tab (not Low Power Mode / Data Saver — those switch the site to lite mode on purpose; test them separately).

## What to do, in order
1. **Cold load.** Close the tab, clear site data (iOS: Settings → Safari → Advanced → Website Data; Android: Chrome → ⋮ → Settings → Site settings), open the link on Wi‑Fi. Note: time until the hero is readable, and whether anything jumps.
2. **Scroll the whole home page** top to bottom at a normal reading pace, then flick fast back up. Note any stutter: where (which section), and whether it is only on first pass.
3. **Theme switch.** Tap the sun/moon 4 times. Note delay between tap and the circle reveal starting.
4. **Residences.** Tap each of the 4 apartment pins quickly. Note lag or flicker.
5. **Gallery.** Open a photo, swipe next/previous 5 times, close.
6. **Tower viewer** (Residences → "View the tower in 3D"). Orbit for 20 seconds. Note: smoothness, device warmth, whether the picture gets softer after a few seconds (that is the adaptive resolution working, not a bug).
7. **Apartment viewer.** Open one apartment in 3D; walk through for 20 seconds.
8. **Repeat 1–2 once more** (warm cache) and note the difference.

## Optional: numbers instead of impressions
Connect the phone to a Mac (iOS: Safari → Develop → *your iPhone*; Android: chrome://inspect). In the page's console paste:

```js
(async () => {
  const frames = []; let last = performance.now(), long = 0;
  new PerformanceObserver((l) => { long += l.getEntries().length; }).observe({ entryTypes: ['longtask'] });
  await new Promise((done) => {
    const t0 = last;
    (function tick(now) { frames.push(now - last); last = now;
      if (now - t0 < 6000) requestAnimationFrame(tick); else done(); })(last);
    // scroll the page for 6 s while sampling
    let y = 0; const h = document.documentElement.scrollHeight - innerHeight;
    const step = () => { y += h / 360; scrollTo(0, y); if (performance.now() - t0 < 6000) requestAnimationFrame(step); }; step();
  });
  frames.sort((a, b) => a - b);
  const p = (q) => frames[Math.floor(frames.length * q)].toFixed(1);
  console.log({ frames: frames.length, p50_ms: p(.5), p95_ms: p(.95), worst_ms: frames[frames.length - 1].toFixed(1), over_33ms: frames.filter((f) => f > 33).length, longTasks: long });
})();
```

## Send back
Device + OS + browser, and for each step above: smooth / minor hitch / janky, plus the snippet's output.
Anything "janky" gets a trace and a targeted fix; "smooth" items are done.
Nothing here collects data from visitors; the snippet only runs in your own console.
