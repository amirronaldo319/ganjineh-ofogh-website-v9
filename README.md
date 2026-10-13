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

## Enquiry notifications

Intake (`GO_ACCEPT_ENQUIRIES=1`) stores each request in SQLite. To be told about new ones, set either:

- `GO_NOTIFY_WEBHOOK=https://…` — receives a JSON POST `{reference, residence, name, mobile, …}` (works with Slack/Telegram bridges, Zapier, n8n, a CRM);
- `GO_SMTP_HOST`, `GO_SMTP_PORT`, `GO_SMTP_USER`, `GO_SMTP_PASSWORD`, `GO_NOTIFY_FROM`, `GO_NOTIFY_TO` — plain email.

Notifications run on a background thread: a dead webhook or mail server never delays or fails the visitor's request (covered by `tests/test_notify.py`).

## Testing

```bash
ln -s ../V8/node_modules node_modules   # or: npm install
PW_CHANNEL=chrome PW_CHROME_ONLY=1 npx playwright test     # Chrome desktop + Pixel 7, using installed Chrome
npx playwright install webkit && npx playwright test        # adds Safari desktop + iPhone 13
```

136 tests pass on the two Chrome projects (2 desktop-only/mobile-only skips). WebKit has **not** been run: no WebKit build was installed on this machine.
Lighthouse (mobile profile, simulated slow 4G, local server with gzip): accessibility 100, best practices 100, SEO 100 on every page tested; performance 82–95 (gallery lowest because it is image-heavy).

## What changed from V8

| | V8 | V9 |
|---|---|---|
| Languages | Persian only | **Persian (default) + English**, switch in the header; remembered; RTL/LTR mirrors the whole layout |
| Theme | one | **Day / Dusk** toggle; follows the OS preference until chosen |
| Facts | 4,065 m² site, 6 m lobby, <5 min access, apartment types A–D (137–150 m²) | **v25 / Revised Master**: 2,064 m² site, 1,400+ m² landscape, 700 m² shared, apartments **1–4: 143.25 / 150 / 166 / 162 m²** |
| Building images | older tower design (no helipad) | current design (helipad tower), 40 optimised WebP images from the Revised Master and v25 |
| Tower 3D | illustrative massing (`tower3d.js`) | the plan-derived v4 viewer (`tower-viewer/`): 5 views, day/golden/night, floor cut-aways, tour, Sources panel |
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

## Pages (16 per language)

`index` · `project` · `architecture` · `residences` · `residence-1…4` · `lifestyle` · `location` · `gallery` · `developer` · `contact` · `thank-you` · `privacy` · `404`

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
