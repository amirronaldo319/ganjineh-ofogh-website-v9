# Ganjineh Ofogh — technical audit

Written 2026-11-13 from the work done so far. Everything stated here was read, run or measured in this repository; items not checked are listed at the end.

## Architecture
- **Static site, built by Python.** `tools/build_site.py` turns `src/pages/*.html` + `src/partials/` + JSON data into 19 pages per language (root = Persian, `en/` = English), minifies CSS/JS with esbuild, inlines first-screen CSS (Playwright capture), writes `sw.js`, `sitemap.xml`, `robots.txt` and share cards.
- **Service worker** (`src/sw.js` → `sw.js`): cache-first for pictures, fonts, 3D libraries and `?v=` files; network-first for pages and unversioned code. Its version and a source fingerprint are written by the build; `tests/test_build_fresh.py` fails when they disagree with the files.
- **Backends (both off until launch):** `server.py` (Python, SQLite, behind Caddy on a VPS) and `functions/` (Cloudflare Pages Functions + D1). Same rules in both: enquiry validation, per-visitor limits, brochure gate, password-protected sales inbox.
- **3D:** `tower-viewer/` is one 712 KB page with its model embedded and a table marking which facts are measured, observed or assumed (heights, floor count are marked assumed). `residences-3d/` is the apartment viewer on three.js r186 (about 2 MB of vendored modules). Neither uses an external model file.
- **Hosting paths:** preview = GitHub Pages under `/ganjineh-ofogh/`; production design = VPS + Caddy (`deploy/`) or Cloudflare Pages (`cloudflare/`). The preview's `robots.txt` disallows everything on purpose; canonicals point at `ganjinehofogh.ir`.

## Feature matrix (current)
| Feature | State |
|---|---|
| Persian + English pages, language switch keeps the page | working (browser suite) |
| Day-to-dusk scroll section | working, unchanged |
| Scroll journey (5 renders, pinned, reversible, skippable) | new, working; plain-list fallbacks |
| Tower viewer, apartment viewer, comparison, gallery, brochure/contact pages | working; forms say "requests are not open" |
| Enquiry backend, brochure PDF, sales inbox | built and tested locally, switched off |
| Real camera flythrough / image sequence | not built: no rendered frames exist |
| Floor and apartment selection on the building | not built: floor-to-unit mapping unconfirmed (`launch/FACTS-TO-CONFIRM.md`) |

## Picture inventory (`assets/img/images.json`)
Every picture is delivered as responsive AVIF + WebP with a colour placeholder. The label column is what the page shows on the picture.

| Image | Source size | Label shown on the page | Delivered widths | Largest file AVIF / WebP (KB) |
|---|---|---|---|---|
| hero | 3840×3840 | Concept render (helipad not a permit) | 480–2200 px | 363 / 730 |
| panorama | 1536×1024 | Concept render | 480–1536 px | 172 / 354 |
| facade | 1536×1024 | Concept render | 480–1536 px | 108 / 203 |
| plaza | 1536×1024 | Concept render | 480–1536 px | 137 / 282 |
| entrance | 1536×1024 | Concept render | 480–1536 px | 134 / 280 |
| garden | 3840×2880 | Concept render | 480–2000 px | 367 / 778 |
| terrace | 3840×2161 | Concept render | 480–2000 px | 185 / 355 |
| villa | 1536×1024 | Concept render | 480–1536 px | 168 / 348 |
| studio | 1536×1024 | Concept render | 480–1536 px | 111 / 204 |
| interior-view | 1536×1024 | Illustrative interior | 480–1536 px | 126 / 256 |
| interior-shelf | 1536×1024 | Illustrative interior | 480–1536 px | 119 / 242 |
| site-diagram | 1152×1440 | Concept diagram | 480–900 px | 10 / 14 |
| lobby | 1536×1024 | Illustrative interior | 480–1536 px | 118 / 232 |
| hall | 1536×1024 | Illustrative interior | 480–1536 px | 122 / 245 |
| cinema | 3840×3541 | Illustrative interior | 480–1800 px | 70 / 100 |
| fitness | 3840×3552 | Illustrative interior | 480–1800 px | 138 / 241 |
| cafe | 3840×3025 | Illustrative interior | 480–1800 px | 125 / 211 |
| lounge | 1024×1280 | Illustrative interior | 480–1024 px | 97 / 190 |
| living | 1536×1024 | Illustrative interior | 480–1536 px | 123 / 254 |
| kitchen | 1536×1024 | Illustrative interior | 480–1536 px | 81 / 143 |
| kitchen-detail | 1122×906 | Illustrative interior | 480–1122 px | 46 / 71 |
| bedroom | 3840×3087 | Illustrative interior | 480–1800 px | 114 / 177 |
| wardrobe | 3840×3601 | Illustrative interior | 480–1800 px | 112 / 182 |
| bath | 1254×1254 | Illustrative interior | 480–1254 px | 67 / 106 |
| study | 1024×1280 | Illustrative interior | 480–1024 px | 80 / 155 |
| tower-day | 1024×1536 | Concept render | 480–1024 px | 158 / 321 |
| tower-dusk | 1024×1536 | Concept render | 480–1024 px | 139 / 268 |
| plan | 984×1067 | Concept cut-away, not to scale | 480–984 px | 85 / 106 |
| apt1 | 1526×768 | Concept cut-away, not to scale | 480–1526 px | 140 / 174 |
| apt2 | 1214×982 | Concept cut-away, not to scale | 480–1214 px | 81 / 92 |
| apt3 | 1004×1206 | Concept cut-away, not to scale | 480–1004 px | 98 / 116 |
| apt4 | 930×1246 | Concept cut-away, not to scale | 480–930 px | 76 / 91 |
| helipad | 1215×1024 | Concept render (helipad not a permit) | 480–1215 px | 61 / 104 |
| aerial | 1448×657 | Concept render (helipad not a permit) | 480–1448 px | 117 / 223 |
| model-view | 1254×1254 | Concept model study | 480–1254 px | 287 / 397 |
| model-render | 1800×1800 | Concept model study | 480–1500 px | 59 / 73 |
| model-section | 1800×1800 | Concept model study | 480–1500 px | 67 / 72 |
| model-floor | 1800×1800 | Concept model study | 480–1500 px | 50 / 55 |
| model-shared | 1800×1800 | Concept model study | 480–1500 px | 30 / 33 |
| model-parking | 1800×1800 | Concept model study | 480–1500 px | 17 / 19 |

3D files: `tower-viewer/vendor/three.min.js` (589 KB), `residences-3d/vendor/three.core.js` (1,423 KB) and `three.module.js` (647 KB). Total `assets/img` 32 MB across all widths.

## Problems found and fixed (all in git history)
1. Source and live site had diverged (hero buttons, tap targets, comparison links, hero crop existed only in the preview repo). Ported into source; a freshness test now prevents drift.
2. Hero photo was cropped by a 3:4 frame, 118% height, zoom and parallax. Now a square frame showing the whole picture.
3. First-visit curtain delayed the hero: title done at 3.25 s, main button at 3.5 s on a phone. Removed: 1.75 s and 2.0 s (measured).
4. Cloudflare sales inbox accepted unlimited password guesses. Now 10 per hour per address, counted in D1, safe against parallel guesses.
5. `0098…` mobile numbers were rejected. One rule now, 29 shared cases, in Python, Cloudflare and both forms.
6. Server: unsafe shared rate-limit tables, enquiries lost when two arrived together on a new database, a crash on a non-numeric `Content-Length`, per-request header cost 278 µs → 0.3 µs.
7. The publish script force-pushed. It now adds one commit, defaults to a dry run, and refuses a dirty tree.
8. Small tap targets (breadcrumbs, table links) enlarged to 44 px without moving the layout.

## Measurements taken
- Journey pictures downloaded on arrival: 725 KB desktop (1440×900), 86 KB on a 390 px phone (AVIF). No change made.
- Hero entrance timing from the browser's own animation timeline (375 px phone): before 3.25 s title / 3.5 s button, after 1.75 s / 2.0 s.
- Browser suite on installed Chrome (desktop + Android profile): 445 passed, 65 skipped by design, 0 failed. Python 42, Cloudflare 13, phone rule 3, GPU viewer specs 44 passed.

## Not checked
Real iPhone/Safari, Firefox, Lighthouse/Core Web Vitals, slow-network behaviour, the production domain (`ganjinehofogh.ir` did not respond from this network), CDN client-address handling.
