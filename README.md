# Ganjineh Ofogh — website V9

Bilingual (Persian / English) site for برج گنجینه افق, built on V8's structure and server.
V8 is untouched; this folder is self-contained.

```bash
python3 server.py           # http://127.0.0.1:8000/   (restart once after updating: the CSP hashes now refresh themselves)
python3 tools/build_site.py # rebuild the HTML pages and minified assets from src/ after any edit
python3 -m unittest tests/test_notify.py          # enquiry notification (webhook) test
npm test                                          # end-to-end suite (needs node_modules; see Testing)
```

## Languages and URLs

Every page is built twice: Persian at `/residence-2.html`, English at `/en/residence-2.html`.
Each page carries `hreflang` alternates (`fa`, `en`, `x-default` = Persian), a per-language canonical, and `sitemap.xml` lists both.
The header switch navigates to the other URL, keeping the query string and hash, and remembers the choice: a visitor who chose English is sent to `/en/…` when they open a Persian URL.
The two 3D viewers are shared by both languages (`/residences-3d/`, `/tower-viewer/`) and follow `?lang=`.

## Filling in what only the owner can supply

`src/site.config.json` holds the contact channels and analytics. Fill what exists and leave the rest empty — **nothing is rendered for an empty field, so no placeholder ever ships**:

```json
{ "phone": "+98…", "phone_display": "۰۲۱ …", "whatsapp": "98…", "telegram": "handle", "eitaa": "handle",
  "rubika": "handle", "instagram": "handle", "email": "…", "hours_fa": "…", "hours_en": "…",
  "analytics": { "src": "https://…/script.js", "domain": "ganjinehofogh.ir" } }
```

Then run `python3 tools/build_site.py`. A filled channel appears on the contact page as a call / WhatsApp / Telegram / Eitaa / Rubika / Instagram / email button and in the structured data.
Analytics is off by default (no tracking). If you set `analytics.src`, also allow its origin to the CSP: `GO_CSP_SCRIPT_ORIGINS="https://…"` (and `GO_CSP_CONNECT_ORIGINS` if it beacons elsewhere).

## Free hosting on Cloudflare

The same site, forms, brochure gate and sales inbox also run on Cloudflare's free plan (Pages + Functions + D1 + R2):
`functions/` is the backend, `cloudflare/schema.sql` the database, `cloudflare/setup.sh` one script that creates and publishes everything,
and `cloudflare/SETUP.md` the 10-minute guide. It is covered by `node --test tests/cloudflare.test.mjs` (8 tests on a local copy of Cloudflare's runtime).
`python3 tools/make_preview.py` builds the publishable folder (`/tmp/ganjineh-preview`, plus `preview.zip` for a dashboard drag-and-drop).

The public address is `host` in `src/site.config.json`; canonical links, hreflang, the sitemap, `robots.txt` and the social cards follow it.

## Sharing, printing and share cards

- **Share cards:** every page has its own 1200×630 card per language (`assets/og/<page>-<lang>.jpg`, drawn by `tools/build_og_pages.mjs`, which `build_site.py` runs and which redraws only what changed). A link pasted into WhatsApp, Telegram or X shows that page's picture and title.
- **Share row:** residence, compare and residences pages have WhatsApp, Telegram, copy-link and (where the device has one) the system share sheet. No tracking.
- **Printable apartment sheet:** each residence page has "Print this apartment": one A4 page with plan, area *as supplied*, layout notes, the disclaimer and a QR code to the page. It is plain CSS (`@media print`), so "Save as PDF" works everywhere. QR codes are SVGs made by `pip install segno` and follow `host`.
- **Fonts:** the three Latin web fonts are trimmed to the characters the site uses (`python3 tools/build_fonts.py`; `--check` reports uncovered characters). Originals stay in `tools/font-sources/`.

## Daily digest and live check

```bash
python3 tools/digest.py --webhook https://…                       # yesterday's enquiries + the ones still waiting for a first call
LIVE_URL=https://your-address npx playwright test -c playwright.live.config.js    # smoke test of the published site
```

`deploy/ganjineh-digest.{service,timer}` send the digest at 08:30 Tehran time on the VPS; on Cloudflare run it from any computer with `--cloudflare`.
The live smoke test (`npm run test:live`) checks every page in both languages, the language switch, the compare tool, the brochure form's honesty, both 3D viewers and that source files are not published.

## Accessibility audit

`tests/e2e/a11y.spec.js` runs axe-core 4.10 (vendored in `tests/vendor/`) on all 17 pages × 2 languages × 2 themes (WCAG 2.2 A/AA and best practices): 102 audits, 0 violations. Automated checks catch about a third of real issues; a screen-reader pass (VoiceOver, TalkBack) is still on the checklist.

## Brochure download

`/brochure.html` (and `/en/brochure.html`) asks for a name and a mobile number, stores the request as a `download` enquiry and sends the visitor to the thank-you page, which offers the PDF.
The PDF is **not** in any public folder: put the final file at `var/brochure.pdf` (or point `GO_BROCHURE_PDF` at it). It is served only at `/api/brochure/<tracking reference>` to someone holding the reference of a stored brochure request, rate-limited, as an attachment. Until a PDF is on file the page says the sales team will send it, and nothing claims a download.

## Sales inbox

Set `GO_ADMIN_PASSWORD` (and optionally `GO_ADMIN_USER`, default `admin`) and open `/admin`. It lists every stored enquiry newest first (Tehran time, Jalali date), filters by status and type, lets the team set a status (جدید / تماس گرفته شد / قرار بازدید / بسته شد / هرزنامه) and a note, shows which brochure requests were downloaded, and exports CSV (Excel-safe, with formula-injection protection).
It is off without the password, answers 404 over plain HTTP outside this machine (behind the proxy it needs `X-Forwarded-Proto: https`), throttles wrong passwords (10 per hour per address), and every change needs a same-origin form token. It has no JavaScript and loads nothing from other sites.

## Thank-you page

After a request the page confirms it with the tracking reference, then lists what happens next for that kind of request (viewing, call-back, brochure) and offers the PDF when one is on file. It states a reply time only if you set `response_time_fa` and `response_time_en` in `src/site.config.json` — fill both with a time the sales team will actually keep, or leave both empty.

## Compare two apartments

`/compare.html`: pick any two of the four apartments and see area, bedrooms, plan shape and layout side by side, with how much larger one is. The choice lives in the address (`?a=1&b=3`) so it can be shared. Only supplied facts are shown; orientation, views and availability are not supplied, and the page says so instead of guessing.

## Launch kit

`launch/` holds what is needed around the website itself:

- `SEO.md` — every page's title and description in both languages with character counts (`python3 tools/build_launch_kit.py` regenerates it from the pages);
- `social/fa`, `social/en` — six cards (brand, residences, philosophy, 3D model, lifestyle, brochure) in square (Instagram feed), story and wide (Telegram) sizes, built by `node tools/build_social.mjs` from the site's own images and text;
- `CAPTIONS.md` — a caption for each card, using only what the site already says;
- `REDIRECTS.md` — the one-address-per-page plan, robots.txt and launch-day `curl` checks. `deploy/Caddyfile` already implements it.

## Monitoring

```bash
python3 tools/monitor.py https://ganjinehofogh.ir --quiet      # exits 0 ok · 1 failed · 2 warnings only
node tools/lighthouse_weekly.mjs https://ganjinehofogh.ir      # writes reports/lighthouse-<date>.{json,md}
```

`monitor.py` (standard library only) checks every page in the sitemap, the home page's assets, `/api/status`, robots.txt, security headers, certificate expiry, the http→https redirect, and that source files, the database and `/admin` are not served; with `--webhook` it tells you when something fails. `deploy/ganjineh-monitor.{service,timer}` run it every 10 minutes on the server. `lighthouse_weekly.mjs` runs mobile Lighthouse on nine pages against budgets (performance 75, the others 95) and against last week's report; `deploy/com.ganjineh.lighthouse.plist` schedules it weekly from a Mac. Nothing is scheduled until you install those files.

## Persian typography

`python3 tools/lint_persian.py` checks the page sources for Arabic letter forms, missing half-spaces (می‌شود, خانه‌ی), punctuation spacing, Latin digits in Persian text and straight quotes. It reports 0 findings today. It checks mechanics only; a native Persian editor should still read the copy for tone.

## Enquiry notifications

Intake (`GO_ACCEPT_ENQUIRIES=1`) stores each request in SQLite. To be told about new ones, set either:

- `GO_NOTIFY_WEBHOOK=https://…` — receives a JSON POST `{reference, residence, name, mobile, …}` (works with Slack/Telegram bridges, Zapier, n8n, a CRM);
- `GO_SMTP_HOST`, `GO_SMTP_PORT`, `GO_SMTP_USER`, `GO_SMTP_PASSWORD`, `GO_NOTIFY_FROM`, `GO_NOTIFY_TO` — plain email.

Notifications run on a background thread: a dead webhook or mail server never delays or fails the visitor's request (covered by `tests/test_notify.py`).

## Testing

```bash
ln -s ../V8/node_modules node_modules                      # or: npm install
npx playwright install webkit                              # once, for Safari's engine
npm test                                                   # end-to-end: Chrome desktop, Pixel 7, Safari desktop, iPhone 13
PW_CHANNEL=chrome PW_CHROME_ONLY=1 npx playwright test    # Chrome projects only
npm run test:visual                                        # screenshots: every page, 4 widths, Day + Dusk
npm run test:visual:update                                 # accept a deliberate design change as the new baseline
```

Last run: Chrome projects 166 passed (2 skips); Safari desktop + iPhone 13 (WebKit) all passed except the Chromium-only tests, which are skipped; visual 160 of 160 identical on a second run. Python: `python3 -m unittest discover -s tests` (notifier, brochure + inbox, monitor).
WebKit here is Playwright's build, not a phone: it proves the layout, scripts and CSS work in Safari's engine, not that the 3D models run well on a real iPhone GPU.
Visual baselines (160 full-page screenshots, about 360 MB) are rendered by Google Chrome on macOS into `tests/visual/__screenshots__/` and are not committed: after a fresh clone run `npm run test:visual:update` once to create them, then `npm run test:visual` compares.
Lighthouse (mobile profile, simulated slow 4G, local server): accessibility, best practices and SEO 100 on every page tested; performance 82–100.

## Speed

- **Images:** every image ships as AVIF (about half the bytes) with WebP as the fallback, through `<picture>`; `tools/build_images.py` writes both.
- **CSS:** `tools/build_critical.mjs` (run by `build_site.py`) inlines the rules each page needs for its first screens and loads the full stylesheet without blocking paint. Without Node + `npm install` the build keeps the normal blocking stylesheet.
- **Server:** `server.py` gzips text, caches `?v=` assets for a year and other assets for 30 days.

## What changed from V8

| | V8 | V9 |
|---|---|---|
| Languages | Persian only | **Persian (default) + English**, switch in the header; remembered; RTL/LTR mirrors the whole layout |
| Theme | one | **Day / Dusk** toggle; follows the OS preference until chosen |
| Facts | 4,065 m² site, 6 m lobby, <5 min access, apartment types A–D (137–150 m²) | **v25 / Revised Master**: 2,064 m² site, 1,400+ m² landscape, 700 m² shared, apartments **1–4: 143.25 / 150 / 166 / 162 m²** |
| Building images | older tower design (no helipad) | current design (helipad tower), 40 optimised WebP images from the Revised Master and v25 |
| Tower 3D | illustrative massing (`tower3d.js`) | the plan-derived v4 viewer (`tower-viewer/`): 5 views, a **time-of-day slider** that sweeps day → golden hour → night, floor cut-aways, tour, Sources panel; `?apt=2&floor=6` opens Floors mode on an apartment (each residence page links to it) |
| Apartment 3D | Persian only, Types A–D | same furnished models, **bilingual**, renumbered to apartments 1–4 (see below) |
| Home page | project summary | hero → philosophy → numbers → day→dusk scroll sequence → 3D tower → teasers |

## Motion

All motion lives in `assets/js/motion.js` and the last block of `assets/css/site.css`; it animates only transform / opacity / clip-path, and none of it runs under `prefers-reduced-motion`.

- **Entrance:** the header, hero arch (rises like a gateway), sun (rises behind it), title lines (unmask), tagline and buttons arrive in a fixed sequence; inner pages use a shorter version.
- **Headlines:** words rise out of a mask when scrolled into view (Persian is split by word only, so letters keep joining); they rise again when the language changes.
- **Depth:** hero arch and sun lean toward the pointer; images drift inside their frames on scroll; buttons lean toward the cursor.
- **Lines and shapes draw themselves:** section rules, map roads, plan pins; counters count up; a drifting typographic band; a footer wordmark.
- **Interaction:** tab panels lift a veil off the image, the plan explorer wipes between apartments, gallery tiles re-enter in sequence on filtering, the lightbox grows out of the thumbnail and slides between images.
- **Transitions:** page-to-page crossfade (cross-document View Transitions, Chromium/Safari 18+), a circle that opens from the button when switching Day ⇄ Dusk, a crossfade when switching language.
- **First visit:** a short curtain (a hairline draws, the wordmark appears, the curtain lifts onto the hero entrance), once per session on the home page, skippable with any key or click; `?intro=1` replays it.
- **Cursor and navigation:** a trailing ring that names what is under it (View / Select); one hairline glides between nav links; apartment cards tilt toward the pointer; a dot index of the home page's sections; in-page links glide with a long even ease; the typographic band speeds up while you scroll; images alternate their wipe direction; a brand arch-and-sun ornament draws itself.
- **Polish:** scroll-progress hairline, paper grain, thin brass scrollbar, buttons with a sweeping fill, links that underline from the reading edge.

## Pages (18 per language)

`index` · `project` · `architecture` · `residences` · `residence-1…4` · `compare` · `lifestyle` · `location` · `gallery` · `developer` · `brochure` · `contact` · `thank-you` · `privacy` · `404`

The enquiry flow (`contact` → `/api/enquiries` → `thank-you?ref=…`), SQLite intake, CSP, rate limits and the `deploy/` kit are carried over from V8 unchanged in behaviour. Intake stays **off** unless `GO_ACCEPT_ENQUIRIES=1`.
`server.py` changes: accepts `residence-1…4` as enquiry units (old `type-a…d` still accepted), hashes inline scripts of `tower-viewer/` too, and lets both 3D viewers be framed by the site only.

## Apartments: how Types A–D became Apartments 1–4

The V8 furnished 3D models were labelled Type A–D with older areas (137 / 143 / 144 / 150 m²). The v25 brochure numbers the same typical floor as Apartments 1–4 with different areas. They were matched by **layout shape** against v25's cut-away images:

| V9 | v25 area | Shape | V8 name |
|---|---|---|---|
| Apartment 1 | 143.25 m² | long, three bedrooms in a row | Type A |
| Apartment 2 | 150 m² | L-shaped, central island | Type D (also 150 m²) |
| Apartment 3 | 166 m² | tall, three bedrooms stacked on one edge | Type C |
| Apartment 4 | 162 m² | compact, irregular | Type B |

Shape and the 150 m² match for Apartment 2 are strong evidence, but **this mapping should be confirmed against the architect's plans**.
Old `?type=a…d` links into the viewer, and `?unit=type-a…d` into the contact form, are mapped accordingly.

## Editing

```
src/pages/*.html      page bodies. Persian is the markup language; English goes in en="…" (also en-alt,
                      en-aria-label, en-content …). <img data-img="name"> expands to a responsive <img>.
                      {{apt_cards}} {{map}} {{timeline}} {{next:…}} etc. are components (tools/build_site.py)
src/pages/_residence.html   template for residence-1…4 (data in tools/build_site.py: APARTMENTS)
src/partials/         head, header, footer, map, nearby, principles, plan explorer, tower viewer block
src/timeline.json     development-experience list (FA + EN)
assets/css/site.css   design tokens + components (logical properties; RTL is automatic)
assets/js/site.js     language, theme, tabs, lightbox, plan explorer, gallery filter, viewer launch
assets/js/motion.js   the animation layer · assets/js/jalali.js  Persian (Jalali) date picker for the visit date
assets/js/contact.js  enquiry form · assets/js/confirmation.js  thank-you states (both bilingual)
src/site.config.json  contact channels + analytics (empty = not rendered)
tools/build_og.py     renders the social share image assets/img/og.jpg
tools/build_images.py PDFs → assets/img/*.webp (needs pymupdf + pillow; sources on the Desktop)
tower-viewer/         v4 tower viewer (local three.js r128), bridged to the page for language + night light
residences-3d/        furnished apartment models; i18n.js translates the viewer's Persian UI on demand
```

## Not carried over from V8 (on purpose)

Older-draft claims that v25 / Revised Master no longer make: 4,065 m² land, 6 m lobby height, "five arteries in under five minutes", "plane trees retained / health walk" path, "view to the adjacent 6,000 m² garden", Types A–D area figures. The 6 m lobby height is in the Revised Master but not in v25 — add it back only if the project team confirms it.
