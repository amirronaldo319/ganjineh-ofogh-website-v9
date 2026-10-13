# Free hosting on Cloudflare, with working forms

Everything here costs nothing on Cloudflare's free plan: the static site (Pages), the enquiry form and brochure gate and sales inbox
(Pages Functions), the database (D1) and the private PDF storage (R2, which asks for a card on file but charges nothing inside the
free allowance — check Cloudflare's current limits on the R2 page before you enable it).

What runs where:

| Part | Cloudflare | Code |
|---|---|---|
| Pages, images, 3D viewers | Pages (static) | `/tmp/ganjineh-preview` built by `tools/make_preview.py` |
| `/api/status`, `/api/enquiries`, `/api/enquiries/<ref>`, `/api/brochure/<ref>` | Pages Functions | `functions/api/` |
| `/admin` sales inbox | Pages Functions | `functions/_admin.js`, `functions/admin/` |
| Enquiries | D1 database `ganjineh-enquiries` | `cloudflare/schema.sql` |
| Brochure PDF | R2 bucket `ganjineh-brochure`, key `brochure.pdf` (private) | uploaded by `setup.sh` |
| Optional partner password | Pages Functions middleware | `functions/_middleware.js` |

The behaviour is the same as `server.py` (same validation, limits, messages, CSV, brochure rules). 8 tests in
`tests/cloudflare.test.mjs` run it on a local copy of Cloudflare's runtime: `node --test tests/cloudflare.test.mjs`.

## One-time setup (about 10 minutes)

1. In the Cloudflare dashboard open **My Profile → API Tokens → Create Token → Create Custom Token**.
   Give it these permissions (all at *Account* level), and the name `ganjineh-deploy`:
   - Cloudflare Pages: **Edit**
   - D1: **Edit**
   - Workers R2 Storage: **Edit**
   - Account Settings: **Read**
2. Copy the token. Treat it like a password: paste it only into your own Terminal, never into a chat.
3. In Terminal:

```bash
cd ~/Desktop/Projects/Websites/V9
```

```bash
export CLOUDFLARE_API_TOKEN=paste-the-token-here
```

```bash
sh cloudflare/setup.sh --brochure ~/Desktop/Ganjineh_Ofogh_v25.pdf
```

It asks for a sales-inbox password, creates everything, uploads the site and prints the address
(`https://ganjineh-ofogh.pages.dev`) and the inbox address (`…/admin`, user `admin`).

Options: `--gate` also asks for a partner password so only people you give it to can open the preview;
`--open-enquiries` lets the forms accept requests (leave it off until someone is ready to answer them);
`--dry-run` prints every step without doing anything. The script can be run again at any time to publish an update.

## Which brochure PDF?

I compared the PDFs on the Desktop with the figures on the site:

| File | Pages / size | 2,064 m² | 143.25 / 166 / 162 m² | Old 4,065 m² | Verdict |
|---|---|---|---|---|---|
| `Ganjineh_Ofogh_v25.pdf` | 28 / 10 MB | yes | yes | no | matches the site; a sensible size for a download |
| `Ganjineh_Ofogh_Revised_Master.pdf` | 25 / 93 MB | yes | partly | no | matches, but far too heavy to download |
| `Ganjineh_Ofogh_Final_Brochure.pdf` | 52 / 216 MB | **no** | **no** | **yes** | contradicts the site (older figures) and is too heavy: do not publish |

Use `v25` unless the team has a newer approved file. Its own pages note that areas and plans need approved project records.

## Moving to your own domain later

Dashboard → Workers & Pages → your project → **Custom domains**. Then set `"host"` in `src/site.config.json` to the new address,
run `python3 tools/build_site.py`, and run `setup.sh` again so canonical links, the sitemap and `robots.txt` follow it. Remove the
`X-Robots-Tag: noindex` line from `_headers` (in `tools/make_preview.py`) when you want search engines to list the site.

## Removing the earlier Git-connected project

The project `ganjineh-ofogh-website-v9` publishes the whole repository (source, tests, notes). Once the new address works,
delete it in the dashboard (its **Settings → Delete project**) so only the website files stay public.
