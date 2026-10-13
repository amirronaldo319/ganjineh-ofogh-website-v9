# Launch checklist — ganjinehofogh.ir (V9)

Status: V9 is a build for review, not a launch. ✅ = checked while building V9 (see "How it was checked"); everything else needs a decision or information.

## Checked in V9

- ✅ All 16 pages load in Persian and English at 1440 px and 390 px with no console errors, no failed requests (apart from the intentional 404), no horizontal overflow and no broken images.
- ✅ English mode leaves no untranslated Persian text on any page.
- ✅ Both 3D viewers run under the server's real Content-Security-Policy; language and night lighting follow the page, and a language change inside a viewer updates the page.
- ✅ Gallery filter, lightbox (keyboard, swipe), tabs, apartment plan explorer, copy-address.
- ✅ Enquiry form states follow the page language; intake is reported as closed unless `GO_ACCEPT_ENQUIRIES=1`.
- ✅ No third-party runtime requests: fonts, three.js and images are self-hosted.
- ✅ End-to-end suite (`tests/e2e`, 138 runs): every page in both languages (`/` and `/en/`), hreflang/canonical/counterpart links, English completeness, per-language 404, language switch URL + persistence, theme persistence, plan explorer and v25 figures, gallery filter + lightbox, enquiry flow end to end with the Jalali date picker, Jalali↔Gregorian conversion (Nowruz 1403/1404/1405, leap years), confirmation states, mobile menu, both 3D viewers, and "no contact channel rendered while the config is empty". 136 pass, 2 are desktop-only/mobile-only skips. Run on Chrome desktop and a Pixel 7 emulation using installed Chrome.
- ✅ Enquiry notification (`tests/test_notify.py`): webhook receives the enquiry; a dead webhook does not break the request.
- ✅ Lighthouse mobile: accessibility 100 / best practices 100 / SEO 100 on index, residences, contact, gallery; performance 82–95.

## Not yet verified in V9

- [ ] Safari / iOS and Firefox (`npm test` includes the WebKit projects once `npx playwright install webkit` has been run), and a real phone GPU for the two 3D models. **Open both 3D viewers on a real iPhone and a mid-range Android before launch.**
- [ ] A screen-reader pass (VoiceOver / TalkBack), and a native-Persian read of all copy (the Persian is the primary text and was written, not translated; have an editor check tone and typography).
- [ ] Persian date picker on real devices (touch, VoiceOver).

## Information needed before launch

- [ ] **Confirm the Type → Apartment mapping** (README) and the area figures (v25: 143.25 / 150 / 166 / 162 m²; the plan photo shows 152.85 / 171.50 / 144.80).
- [ ] Is the 6 m lobby height still valid? (in the Revised Master, not in v25)
- [ ] Verified sales phone number and the messaging channels you will actually staff (WhatsApp / Telegram / Eitaa / Rubika / Instagram) → `src/site.config.json`, then rebuild.
- [ ] Enquiry destination: CRM or monitored email, and the person responsible for replies.
- [ ] Privacy page: data-retention period and a contact for access / deletion requests.
- [ ] Architect-approved plans, dimensions and unit specifications for Apartments 1–4; floor count and storey heights for the tower model.
- [ ] Final logo. The social share image (`assets/img/og.jpg`) is generated from the site's own render by `tools/build_og.py`; replace once there is a final one. Hi-res originals: see `ASSETS-REQUEST.md`.
- [ ] Pick an analytics tool if you want one (off by default; see README).
- [ ] Check the English transliterations of place names in the Location page.

## Hosting

Unchanged from V8: `DEPLOY.md` and `deploy/` (Caddy, systemd, daily SQLite backup). Prefer Iranian hosting for visitors in Iran; keep `var/` private; set `GO_TRUST_PROXY=1` behind the proxy; set `GO_ACCEPT_ENQUIRIES=1` only when the destination above is live.
