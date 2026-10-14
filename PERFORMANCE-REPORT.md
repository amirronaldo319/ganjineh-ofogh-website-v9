# Performance pass — `perf/invisible-optimizations`

Baseline = tag `perf-baseline` (99be65e, the live site). Nothing here is merged, pushed or deployed.
Rule applied: only changes that leave appearance, motion, behaviour and content exactly as they were.

## 1. What was measured (lab, Chrome, 4× CPU throttle, 1440×900, interleaved A/B, 5 runs, median [min–max])

| Area | Finding | Evidence |
|---|---|---|
| Load | Already fast: FCP ≈ 0.5 s, LCP ≈ 0.8 s, CLS 0, Lighthouse mobile 85–98. Main cost is the browser's own layout of a ~1,400-node page (≈ 290 ms layout, 3 large layouts) | measured |
| Scroll | One layout + ≈5 style recalcs per frame, no long frames; already rAF-coalesced and IntersectionObserver-gated | measured |
| Pointer on hero / inner-page hero | `--mx/--my` were written on the whole hero, invalidating its entire subtree each move, although only 3 rules read them; plus a `getBoundingClientRect()` forced layout per move | measured |
| Theme switch | ≈ 2 s of style recalc over 4 toggles — a whole-document recalc inherent to flipping `data-theme` inside a View Transition | measured |
| 3D viewers | Render every frame; adaptive-resolution logic depends on every frame being drawn | code reading + measured |
| Idle SVG | One far-down SVG re-lays out ~1×/frame: 0.04 ms each (≈ 10 ms per 240 frames) | measured, negligible |

## 2. Changes made (1)

`assets/js/motion.js`, hero pointer parallax:
- `--mx/--my` are now set on the three elements that read them (`.hero__art .arch`, `.hero__sun`, `.phero__art .arch`) instead of on `.hero`.
- The hero's box is measured once (ResizeObserver + resize invalidation) and pointer positions use page coordinates, so no per-move layout read.
Same easing, same constants, same formulas, same values.

## 3. Before / after (identical conditions, medians)

| Scenario | Metric | Before | After | Δ |
|---|---|---|---|---|
| Pointer over home hero (240 moves) | style recalc ms | 789 [751–841] | 349 [308–378] | −56 % |
| | main-thread task ms | 1897 [1828–1989] | 1329 [1208–1398] | −30 % |
| | script ms | 54 | 43 | −20 % |
| Pointer over inner-page hero (residences) | style recalc ms | 423 [400–448] | 208 [193–217] | −51 % |
| | forced layouts | 1 | 0 | −100 % |
| | task ms | 1027 [997–1097] | 746 [712–761] | −27 % |
| Load (home, fa) FCP / LCP / TBT | ms | 496 / 800 / 90 | 500 / 812 / 80 | within noise (±10–20 %) |
| Scroll (home) p50 / p95 frame | ms | 33 / 33 | 33 / 33 | unchanged |
| Apt switch, gallery open, theme switch | task ms | 868 / 319 / 3288 | 836 / 340 / 3120 | within noise |

Honest reading: the pointer path is a real, repeatable win; load, scroll and interactions are unchanged because the change does not touch them.

## 4. Regression results

- Computed `translate` of the three parallax elements, A vs B, 5 pointer positions + after a scroll, 6 pages × 2 viewports (fa/en): 12/12 identical.
- Python unit tests 27/27, Cloudflare tests 8/8, Persian lint 0 findings.
- Playwright e2e (Chrome desktop + Android profiles): 349 passed, 0 failed, 51 skipped (WebKit/iOS-only projects, not run under `PW_CHROME_ONLY`).
- Not re-run in this pass: full visual-regression suite and WebKit projects (the changed code is Chrome/desktop-pointer only and gated on `(hover: hover) and (pointer: fine)`; reduced-motion and lite mode return before this code runs).

## 5. Not applied — would need your decision, or is not worth the risk

| Idea | Why not applied | Possible gain |
|---|---|---|
| Pause 3D render loop when idle / offscreen (dirty-flag rendering) | Changes the adaptive-resolution sampling (frame 90 average) → different quality state; not exactly equivalent | large GPU/CPU saving while a viewer is open |
| `content-visibility:auto` on long sections | Changed document height (17 276 → 15 563 px) in the experiment; scroll bar and anchors would shift | modest initial-layout saving |
| Defer init-time measurements (site.js `onScrollFx`, motion.js nav indicator) into a first rAF | Same output, but removes only ~40 ms @4× (~10 ms real) of a layout that must happen anyway; inside noise, adds ordering risk | ~10 ms |
| Cheaper theme switch | Whole-document recalc is inherent; reducing it means changing what animates | up to ~0.5 s @4× per toggle |
| `backdrop-filter` on gallery labels → solid fill | Visible change | GPU cost on low-end phones |
| Long-lived caching headers | GitHub Pages cannot set them (max-age 600); needs a host with header control (Cloudflare Pages / own server — `server.py` already does) | repeat-visit speed |

## 6. Limits of this report

Lab numbers on one Mac under CPU throttling; no real-device or real-network (including in-Iran) measurements; no field/RUM data. Real phones, Safari/WebKit scrolling and low-end GPUs for the 3D viewers are untested.
