# Deploying ganjinehofogh.ir

A single Linux VPS (Ubuntu 22.04+) runs `server.py` behind Caddy, which provides HTTPS. For a `.ir` domain, an Iranian host (for example an ArvanCloud VPS) is recommended so visitors in Iran reach the site reliably. Files for this setup are in `deploy/`.

## 1. Domain

At your `.ir` registrar (nic.ir or its reseller), add DNS records pointing to the server's public IP:

- `A  ganjinehofogh.ir      → <server IP>`
- `A  www.ganjinehofogh.ir  → <server IP>`

## 2. Server

```bash
sudo apt update && sudo apt install -y python3 git caddy
sudo useradd --system --home /srv/ganjineh --shell /usr/sbin/nologin ganjineh
sudo mkdir -p /srv/ganjineh/data /srv/ganjineh/backups
sudo git clone https://github.com/amirronaldo319/ganjineh-ofogh-website.git /srv/ganjineh/site
sudo chown -R ganjineh:ganjineh /srv/ganjineh
sudo chmod 700 /srv/ganjineh/data /srv/ganjineh/backups
```

The repository is private: clone with a GitHub deploy key or a personal access token.

## 3. App service and HTTPS

```bash
sudo cp /srv/ganjineh/site/deploy/ganjineh.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now ganjineh
sudo cp /srv/ganjineh/site/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains the certificate automatically once DNS resolves. If outbound access to the certificate authority is restricted, use the host's own SSL (e.g. ArvanCloud CDN/SSL) in front and keep Caddy on HTTP.

## 4. Backups

```bash
sudo chmod +x /srv/ganjineh/site/deploy/backup.sh
sudo -u ganjineh crontab -e   # add:  15 3 * * * /srv/ganjineh/site/deploy/backup.sh
```

## 5. Checks

```bash
curl -sI https://ganjinehofogh.ir/ | grep -iE "strict-transport|content-security|cache-control"
curl -s https://ganjinehofogh.ir/api/status
```

## Turning on enquiries

Only after an enquiry destination and a responsible person are confirmed: set `GO_ACCEPT_ENQUIRIES=1` in `/etc/systemd/system/ganjineh.service`, then `sudo systemctl daemon-reload && sudo systemctl restart ganjineh`. Export with `sudo -u ganjineh env GO_DB_PATH=/srv/ganjineh/data/enquiries.sqlite3 python3 server.py export > enquiries.csv`, and keep exports private.

## Brochure, sales inbox, monitoring

```bash
sudo install -o ganjineh -g ganjineh -m 600 /path/to/final-brochure.pdf /srv/ganjineh/data/brochure.pdf   # then set GO_BROCHURE_PDF in ganjineh.service
sudo systemctl edit ganjineh        # add:  [Service]  Environment=GO_ADMIN_PASSWORD=<a long passphrase>
sudo cp /srv/ganjineh/site/deploy/ganjineh-monitor.* /etc/systemd/system/ && sudo systemctl enable --now ganjineh-monitor.timer
```

The sales inbox is then at `https://ganjinehofogh.ir/admin`. See README → Sales inbox, Monitoring and `launch/REDIRECTS.md`.

## Updating

```bash
cd /srv/ganjineh/site && sudo -u ganjineh git pull && sudo systemctl restart ganjineh
```

Restart after a pull so new code is loaded. (The Content-Security-Policy hashes for inline scripts refresh themselves when a page changes.)

## Caching: what each host can and cannot do

| Host | Cache headers | What repeat visitors get |
|---|---|---|
| Your own server (`server.py` behind nginx, above) | Yes: `/assets/` 30 days, `?v=` files 1 year immutable, 3D viewer libraries and pictures 30 days, HTML and `sw.js` always revalidate | Fast repeat visits from the browser cache; the service worker adds offline fallback |
| Cloudflare Pages (`tools/make_preview.py` writes `_headers`) | Yes, same rules. Note `*.pages.dev` is filtered in Iran; a custom domain proxied by Cloudflare is the workaround | As above |
| GitHub Pages (`tools/publish_github_pages.sh`) | No: fixed `max-age=600`, cannot be changed | The **service worker** (`/sw.js`, registered over HTTPS only) keeps pictures, fonts and 3D libraries on the device; a revisit makes ~3 requests instead of ~27 in a revalidating setup |

Service worker rules, in one place: pictures, fonts, models, `/vendor/` libraries and `?v=` files are cache-first; HTML and unversioned scripts/styles/JSON are network-first with the cached copy used only if the network fails or takes more than 4 s; `/api/*`, `/admin*`, POSTs, Range requests and other origins are never touched. Every build writes a new version into `sw.js`, and activating it deletes all older caches. To switch it off for everyone, publish a `sw.js` that calls `self.registration.unregister()` (or remove the registration block at the end of `assets/js/site.js`).

Verify after a deploy:

```bash
curl -sI https://HOST/sw.js | grep -i cache-control               # must NOT be long-lived
curl -sI https://HOST/assets/img/hero-1200.avif | grep -i cache-control
```

## Scheduled checks from a Mac (while the site is on the GitHub Pages preview)

```bash
sh tools/install_scheduled_checks.sh                 # daily health check 08:30 + Lighthouse Mondays 09:00
sh tools/install_scheduled_checks.sh https://ganjinehofogh.ir   # point them at the real domain (then drop --preview in the plist)
sh tools/install_scheduled_checks.sh --remove
```

A failing check shows a macOS notification; every run is appended to `~/Library/Logs/ganjineh/<name>-history.log`. launchd jobs
cannot read `~/Desktop`, so the tools are staged in `~/.ganjineh-checks` (re-run the installer after editing them). On a real server
use the systemd timers in `deploy/` and drop `--preview`.
