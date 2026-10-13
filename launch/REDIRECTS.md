# Domain, redirects and robots

Everything below is already in `deploy/Caddyfile` and `robots.txt`. This page explains why, and what to check on launch day.

## One address per page

| Visitor types | Goes to | How |
|---|---|---|
| `http://ganjinehofogh.ir/…` | `https://ganjinehofogh.ir/…` | Caddy does this by default |
| `https://www.ganjinehofogh.ir/…` | `https://ganjinehofogh.ir/…` | `redir … permanent` (301) |
| `/index.html` | `/` | 301 — the canonical home page is `/` |
| `/en/index.html` | `/en/` | 301 |
| `/en` | `/en/` | 301 |

Pages keep their `.html` addresses (`/residences.html`, `/en/residences.html`). Each carries a canonical link to itself and `hreflang` links to its other language, so search engines treat the two languages as one page in two languages.

## robots.txt

`/api/` and `/admin` are disallowed; the sitemap is declared. `thank-you` pages are kept out of search with `noindex` (not with robots.txt, which would stop crawlers from seeing the `noindex`).

## Old addresses

If a previous version of this website was ever live on the domain (for example V8), list its URLs and I will add a 301 for each to the matching page. None is assumed here.

## Launch-day checks

```bash
curl -sI http://ganjinehofogh.ir/        | grep -i -E "^HTTP|location"      # → 301 to https
curl -sI https://www.ganjinehofogh.ir/   | grep -i -E "^HTTP|location"      # → 301 to the bare domain
curl -sI https://ganjinehofogh.ir/index.html | grep -i -E "^HTTP|location"  # → 301 to /
curl -sI https://ganjinehofogh.ir/en     | grep -i -E "^HTTP|location"      # → 301 to /en/
curl -s  https://ganjinehofogh.ir/robots.txt
curl -s  https://ganjinehofogh.ir/sitemap.xml | head
curl -sI https://ganjinehofogh.ir/admin  | head -1                          # → 404 unless GO_ADMIN_PASSWORD is set
python3 tools/monitor.py https://ganjinehofogh.ir                           # the full check in one command
```

After launch: add the domain to Google Search Console (and Bing Webmaster Tools), submit `sitemap.xml`, and check that both `/` and `/en/` are indexed.
