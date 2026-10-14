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

---

# Addendum — verification and audits (`perf/verification-and-audits`)

## A. Verification gaps closed
| Check | Result |
|---|---|
| Visual regression, 168 screenshots (fa/en × all pages × 320/768/1024/1440 × day/dusk) vs the original site | 168/168 within tolerance. One snapshot (`fa index · 768 · dusk`) was captured mid-counter in the original baseline and failed against its own baseline too; re-captured, then original and branch both pass |
| WebKit (Desktop Safari + iPhone 13 profiles) | 339 passed, 2 failed — both fail identically on the untouched original tree (iPhone: WebKit `innerText` drops one space at a soft wrap in a heading while `textContent` is correct; desktop: intermittent plan-explorer click race) |
| Chrome desktop + Android e2e | 342 passed; 1 intermittent failure of the contact-form submit under parallel load, 0/32 on re-runs, 0/16 on the original |
| Python 27/27, Cloudflare 8/8, Persian lint 0 | pass |

## B. Image weight audit (12 pages × 2 languages × 6 viewport/DPR combinations, 1,068 image placements)
Finding: images are sized correctly almost everywhere, but the srcset ladder had large gaps (1000→2000, 1200→2200, 900→1536 px), so a device needing 1,080 px was served the 2,000 px file.

Change: `tools/add_image_rungs.py` adds one intermediate width wherever neighbours were >1.6× apart (31 images, 6.9 MB of new files in the repo; visitors only download the one they need). Existing files, `sizes`, display sizes and layout are untouched.

| Viewport | Avg image KB per page, before → after | Images ≥1.6× oversize |
|---|---|---|
| Phone 360 @3× | 958 → 748 (−22 %) | 28 → 0 |
| Phone 412 @2.6× | 958 → 742 (−23 %) | 28 → 0 |
| Tablet 768 @2× | 702 → 675 (−4 %) | 12 → 8 |
| Laptop 1440 @1× | 323 → 323 | 0 → 0 |
| Retina laptop 1440 @2× | 791 → 756 (−4 %) | 18 → 0 |
| Desktop 1920 @1× | 468 → 453 (−3 %) | 98 → 92 |

Cost to be aware of (needs your decision before it ships): serving a different file is not pixel-identical. Over 83 changed renders, PSNR vs the old file median 33 dB (min 19 dB on a foliage-heavy photo at 3×); side-by-side with a 6× amplified diff shows only fine-detail resampling noise, and 3 of 83 gallery tiles on a 360 px phone are 1 CSS px taller/shorter because intrinsic size is rounded per file. The full visual-regression suite (DPR 1) passes.

Not done: desktop 1920 @1× still shows ≥1.6× overshoot for 92 placements — those are `sizes` hints that over-state the slot width, which needs a per-image layout review (a visible-risk change), and the audit's soft-image list (tablet @2× shows 0.5–0.7× pixels for a few 480–720 px files) is a quality trade-off, not a bug.

## C. Font audit
- Latin fonts were already trimmed to used glyphs; `build_fonts.py --check` confirms coverage.
- Finding: every **English** page downloaded the whole 45 KB Persian font to paint two letters (the "فا" language button) and, on home/location, a few Persian place names.
- Change: used-glyph subsets of the same variable font (outlines, weights and shaping features preserved): Persian pages 45 → 26 KB, English pages 45 → 16 KB. The full file remains the fallback face, so a character not in a subset (e.g. a visitor typing a rare letter) still renders in Vazirmatn. Persian-bearing elements (hero title, map labels, language button) are byte-identical in screenshots, and page heights are unchanged on all 9 pages checked.

## D. Real-device check
`launch/REAL-DEVICE-CHECK.md` — a 15-minute script for one phone with an optional console snippet that reports frame times. Needs a person with a phone; nothing is collected from visitors.
