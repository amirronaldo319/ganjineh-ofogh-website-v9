# Ganjineh Ofogh — project guide

Bilingual (Persian default, English at `/en/`) static website for برج گنجینه افق, a residential tower in Ozgol, Tehran. A real project: never invent facts, and keep every picture's honesty label (`IMAGE_KINDS` in `tools/build_site.py`).

- **Live:** GitHub Pages preview https://amirronaldo319.github.io/ganjineh-ofogh/ (repo `amirronaldo319/ganjineh-ofogh`, generated files only). `ganjinehofogh.ir` is hosted somewhere not yet known: nothing here updates it.
- **Source of truth:** this repo (`origin` = `amirronaldo319/ganjineh-ofogh-website-v9`, public, CI runs on pushes to `main` and on pull requests). Progress: `docs/IMPLEMENTATION_STATUS.md`. Findings: `docs/GANJINEH_AUDIT.md`.

## Where to change things
Edit `src/` (pages, partials, JSON data), `assets/css/site.css`, `assets/js/*.js` (not `*.min.js`), `tools/`. **Never edit built files** (root `*.html`, `en/*.html`, `*.min.*`, `sw.js`): the next build replaces them and returning visitors keep stale copies.

```bash
python3 tools/build_site.py                      # rebuild pages, minified assets, service worker (needs node_modules for critical CSS)
python3 -m unittest discover -s tests -p "test_*.py"   # unit tests incl. test_build_fresh (built files match source)
python3 tools/lint_persian.py                    # Persian typography
node --test tests/mobile.test.mjs                # one phone-number rule, shared cases in tests/fixtures/mobiles.json
node --test tests/cloudflare.test.mjs            # Cloudflare functions (downloads wrangler; run tools/make_preview.py first)
PW_CHANNEL=chrome PW_CHROME_ONLY=1 NO_GPU=1 npx playwright test   # browser suite (see below)
python3 server.py                                # local preview at http://127.0.0.1:8000
```
Playwright's own browser download is blocked from Iran-side networks (403): use `PW_CHANNEL=chrome` (installed Google Chrome). Safari/iPhone projects exist but have not been run here. After starting a fresh `server.py`, load one page before scripted captures (first requests can fail).

## Publishing the preview
```bash
git status            # must be clean and committed
sh tools/publish_github_pages.sh           # DRY RUN: lists what would change
sh tools/publish_github_pages.sh --push    # adds ONE commit on top of the preview's history; asks to type the repo name
```
It never force-pushes. Undo: `git revert <publish commit>` in a clone of the preview repo. Ask the owner before any publish.

## Rules that matter here
- No new libraries without a measured reason (Iran-side networks: everything is self-hosted; no CDNs). The scroll journey uses CSS plus a few lines in `site.js`.
- Every change that adds a picture needs its kind label and honest alt text; reuse the site's existing wording for pictures it already describes.
- Motion must have a fallback: no JS, `prefers-reduced-motion`, Data Saver (`data-lite`), print. Pinned sections must be skippable.
- Phone-number rule lives in 3 places (`server.py`, `functions/_lib.js`, the two form scripts): change all together and update the shared cases.
- Launch blockers only the owner can clear: sales phone/messenger, reply time, brochure PDF choice, domain hosting. Forms stay "not open" until then (`src/site.config.json`, `launch/`).
