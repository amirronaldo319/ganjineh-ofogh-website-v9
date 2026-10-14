# Sales-journey decisions

Six things stand between the preview and a site that can take a buyer's request. Items marked **done** are in the code now;
the rest need a decision or information from the project team, and each says exactly what to change.

| # | What | Status | Who | What to do |
|---|---|---|---|---|
| 1 | Connect the public site to a working enquiry backend | **Blocked until hosting is chosen** | Owner | Pick one option under *Hosting* below. The form code already asks the backend next to the site (`api/status`, `api/enquiries`), keeping any path prefix, and a different address can be set with `api_base` in `src/site.config.json`. |
| 2 | A verified direct contact route | **Waiting for information** | Owner | Fill `phone`, `whatsapp`, `eitaa`, `rubika`, `telegram` and/or `email` in `src/site.config.json`, rebuild, then try each link from a real phone. They appear on the contact page, in the preview notice and (email) as a draft button when the form is closed. |
| 3 | Make preview status clear next to the request buttons | **Done** | — | While `"mode": "preview"`, a one-line note sits beside the viewing/brochure buttons (home, apartment pages, the call-to-action band) and a panel opens the contact and brochure pages. They hide themselves when a working backend answers, and `"mode": "live"` removes them at build time. |
| 4 | Choose one production architecture | **Owner decision** | Owner | See *Hosting*. |
| 5 | Who answers enquiries, who covers absences, how fast | **Owner decision** | Owner | See *Responsibility*. |
| 6 | Approve the brochure PDF and test the journey | **Owner decision + test** | Owner, then me | See *Brochure*. |

## Hosting (items 1 and 4)

| Option | What it is | Tested | Good for | Watch out for |
|---|---|---|---|---|
| **A. Iranian VPS + `server.py` + Caddy** (`DEPLOY.md`, `deploy/`) | One small Linux server in Iran, HTTPS by Caddy, SQLite on disk, daily backup, monitor and digest timers | Python tests (24) and the full browser suite | Visitors in Iran: fastest, not filtered, `.ir` domain works. Forms, brochure gate and sales inbox all run. | Needs a server and a `.ir` domain; someone must keep it updated. |
| **B. Cloudflare Pages + Functions + D1 + R2** (`cloudflare/SETUP.md`) | Free tier; same behaviour, database and private PDF | 8 tests on a local copy of the runtime; not yet run on a real account | Foreign visitors, zero server care | `*.pages.dev` is filtered in Iran: needs a custom domain; needs a Cloudflare API token. |
| **C. Static preview only** (current GitHub Pages link) | No backend | — | Showing the design | Cannot take requests. Use only until A or B is live. |

**Recommendation: A**, with the domain `ganjinehofogh.ir` (or the real one: `host` in `src/site.config.json`).
Done when one command sequence on a clean server produces a site where the three requests (viewing, call-back, brochure) are saved,
return a reference, appear in `/admin` and reach the responsible person (below).

## Responsibility (item 5)

Fill this in, then put it in `src/site.config.json` and the server environment.

| Question | Answer | Where it goes |
|---|---|---|
| Who receives new requests first? | | `GO_NOTIFY_WEBHOOK` (Telegram/Slack bridge) or `GO_SMTP_*` + `GO_NOTIFY_TO` |
| Who covers when they are away? | | a second address on the same webhook/email list |
| Who sees the sales inbox? | | `GO_ADMIN_PASSWORD` (share it only with them) |
| Reply time the team can really keep | | `response_time_fa` / `response_time_en` (leave empty until sure) |
| Who is reminded of requests nobody has called? | | `deploy/ganjineh-digest.timer` (08:30 Tehran) |

A request that is stored and never answered is still a failed journey, so do not set a reply time you cannot meet.

## Brochure (item 6)

1. Approve one file. `Ganjineh_Ofogh_v25.pdf` (28 pages, 10 MB) matches the website's figures; `Final_Brochure.pdf` does not (older figures, 216 MB).
2. Check its figures against the site once more (2,064 m²; 143.25 / 150 / 166 / 162 m²; no 4,065 m²).
3. Put it on the server: `var/brochure.pdf` (or `GO_BROCHURE_PDF`); on Cloudflare `setup.sh --brochure …`.
4. Test the whole journey on the production system: brochure page → name and number → confirmation page → **Download** → open the PDF → see "downloaded" in `/admin`.
5. Only then set `"mode": "live"` and rebuild.

## Facts the buyer will test (second review)

| What | Status | Next |
|---|---|---|
| Conflicting areas (Apartments 2, 3, 4 differ between the brochure and the plan photo) | **Site is ready for one correction**: edit `src/apartments.json`, rebuild; every surface follows and a test guards it. The basis of measurement is shown as "not yet confirmed". | Team states the right values and what each includes (net/gross, balconies, terraces). |
| Apartment-to-model mapping (1→A, 2→D, 3→C, 4→B by plan shape) | Each apartment page now says the match is being confirmed. | Architect confirms or corrects; then the notice can be removed. |
| Floor count and heights | Marked *(assumed)* in the tower model, in the FAQ and on the home page. | Approved sections/elevations. |
| Helipad | Every picture that shows it says it is not a permit. | Written status of the roof use. |
| Dimensioned plans | Each apartment page says they will be added once approved. | Approved plans with room sizes, orientation, balcony boundaries. |
| Availability, delivery, parking/storage, views, terms | Listed as "not yet published", with how to ask. Nothing is estimated. | Verified details, then they replace the list. |
| Developer evidence | Wording no longer claims a "documented record"; the page says details will be added project by project. | Named projects, completion dates, the group's role, photographs. |
| Image labels | Done: every picture is labelled by kind (see README). | Add "construction photograph" labels when such photos exist. |
