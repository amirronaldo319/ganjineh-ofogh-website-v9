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

## Updating

```bash
cd /srv/ganjineh/site && sudo -u ganjineh git pull && sudo systemctl restart ganjineh
```

Restarting is required: the Content-Security-Policy hashes for inline scripts are computed when the server starts.
