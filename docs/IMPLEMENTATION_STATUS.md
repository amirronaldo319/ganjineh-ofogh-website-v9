# Implementation status

Statuses: NOT STARTED · IN PROGRESS · IMPLEMENTED (works, not fully tested) · VERIFIED (tests run, evidence given) · BLOCKED (needs something outside the code). Updated 2026-11-13. Preview published up to `0a1f45c`; the editable source branch is `chore/project-guide-and-ledger` (contains everything).

| Item | Status | Evidence / next step |
|---|---|---|
| Source ↔ live reconciliation, freshness test | VERIFIED | `tests/test_build_fresh.py` (mutation-checked); live files byte-identical to the tested build |
| Service-worker version tied to content | VERIFIED | version + source fingerprint in `sw.js`; browser `service-worker.spec.js` passes |
| Hero shows the whole tower | VERIFIED | screenshots desktop/phone; live |
| Hero opening delay removed | VERIFIED | animation timeline measured, 3.5 s → 2.0 s |
| Admin login throttle (Cloudflare) | VERIFIED | 3 new tests incl. 30 parallel guesses; real Cloudflare deployment not tested |
| Server limiter, CSP cost, crash fixes | VERIFIED | 42 Python tests incl. parallel burst |
| One Iranian mobile rule | VERIFIED | `tests/fixtures/mobiles.json` run by Python, Node, and the form scripts |
| Safe publish script | VERIFIED | two real publishes, dry runs, refusal and failure paths rehearsed |
| Scroll journey on the home page | VERIFIED | 42 test runs across the Chrome desktop and Android profiles (advance, reverse, skip, labels, 5 phone/tablet shapes, 3 near-square, no-JS, reduced motion, Data Saver); live; real iPhone/Safari not tested |
| Liquid-glass controls | IMPLEMENTED (minimal) | only the journey's skip button uses blur (its background is semi-opaque, so it stays readable without blur support); no wider system |
| Day-to-dusk refinement | NOT STARTED | works as is; any change should keep `--p` logic in `site.js` |
| Final "full tower reveal" with the two actions after the journey | NOT STARTED | small: reuse hero actions after `#daydusk` |
| Scroll-driven image sequence / camera flythrough | BLOCKED | needs rendered frames or footage of the real building; the screen recording mentioned in the briefs was never attached |
| Real-time camera path through the model | BLOCKED | tower model is provisional (heights and floor count marked assumed); no verified geometry |
| Floor / apartment selection on the 3D tower | BLOCKED | floor-to-unit mapping unconfirmed (`launch/FACTS-TO-CONFIRM.md` #3, #5) |
| Tower viewer named views, day/dusk light, shareable links | IMPLEMENTED (existing) | covered by `viewer3d.spec.js` (44 GPU specs pass); camera reset not separately checked |
| Comparison redesign | NOT STARTED | existing tool works (tests pass); a side-by-side phone layout would be the next step |
| Remaining page redesigns | NOT STARTED | design tokens already shared; no page-specific problems found in the sweep (288 page/width checks, 0 overflow, 0 console errors) |
| Lighthouse / Core Web Vitals | NOT STARTED | not run in this environment |
| Safari, Firefox, real devices | NOT STARTED | Playwright WebKit projects exist; browser download is blocked here |
| Enquiry forms, brochure, sales phone | BLOCKED | owner must supply handle, reply time, PDF choice (`launch/CONFIRM-IN-5-MINUTES.md`) |
| Update `ganjinehofogh.ir` | BLOCKED | hosting unknown; the preview repo has no `CNAME` |

## Next concrete steps
1. Owner: say where `ganjinehofogh.ir` is hosted, and answer section A of `launch/CONFIRM-IN-5-MINUTES.md`.
2. Owner: supply rendered frames/footage if a real flythrough is wanted; then build the canvas image-sequence section (design notes: preload ≤ 2 chunks ahead, fall back to the existing stills).
3. Run Lighthouse on Home, a residence page and the tower viewer with a throttled phone profile.
4. Run the WebKit projects on a machine that can download Playwright browsers.
