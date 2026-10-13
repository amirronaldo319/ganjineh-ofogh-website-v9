#!/bin/sh
# One-shot setup of the free Cloudflare version: static site + enquiry form + brochure gate + sales inbox.
#
#   export CLOUDFLARE_API_TOKEN=...        # see cloudflare/SETUP.md; type it in your own Terminal, never in a chat
#   sh cloudflare/setup.sh [--brochure path/to/brochure.pdf] [--open-enquiries] [--gate] [--dry-run]
#
# It is safe to run again: existing resources are reused. Nothing is created without CLOUDFLARE_API_TOKEN.
set -eu
cd "$(dirname "$0")/.."

PROJECT="ganjineh-ofogh"
DB="ganjineh-enquiries"
BUCKET="ganjineh-brochure"
BROCHURE=""; OPEN=0; GATE=0; DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --brochure) BROCHURE="$2"; shift ;;
    --open-enquiries) OPEN=1 ;;
    --gate) GATE=1 ;;
    --dry-run) DRY=1 ;;
    *) echo "unknown option: $1" >&2; exit 64 ;;
  esac
  shift
done

run() { if [ "$DRY" = 1 ]; then echo "+ $*"; else "$@"; fi; }
wr() { run npx --yes wrangler@latest "$@"; }

[ "$DRY" = 1 ] || : "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN first (see cloudflare/SETUP.md)}"
[ -z "$BROCHURE" ] || [ -f "$BROCHURE" ] || { echo "brochure file not found: $BROCHURE" >&2; exit 66; }

echo "1/7 packing the site"
run python3 tools/make_preview.py
if [ "$GATE" = 1 ]; then
  run sh -c "printf '%s\n' '{\"version\": 1, \"include\": [\"/*\"], \"exclude\": []}' > /tmp/ganjineh-preview/_routes.json"
fi

echo "2/7 database"
if [ "$DRY" = 1 ]; then ID="<database id>"; else
  ID=$(npx --yes wrangler@latest d1 list --json 2>/dev/null | python3 -c "import sys,json; print(next((d['uuid'] for d in json.load(sys.stdin) if d['name']=='$DB'), ''))")
  if [ -z "$ID" ]; then
    npx --yes wrangler@latest d1 create "$DB" >/dev/null
    ID=$(npx --yes wrangler@latest d1 list --json | python3 -c "import sys,json; print(next(d['uuid'] for d in json.load(sys.stdin) if d['name']=='$DB'))")
  fi
  python3 - "$ID" <<'PY'
import re, sys
p = "wrangler.toml"
s = open(p).read()
open(p, "w").write(re.sub(r'database_id = "[^"]*"', f'database_id = "{sys.argv[1]}"', s))
PY
fi
echo "   database id: $ID"
wr d1 execute "$DB" --remote --file cloudflare/schema.sql

echo "3/7 private file storage for the brochure"
wr r2 bucket create "$BUCKET" || true
if [ -n "$BROCHURE" ]; then
  wr r2 object put "$BUCKET/brochure.pdf" --file "$BROCHURE" --remote
  echo "   brochure uploaded"
else
  echo "   no --brochure given: the site will say the team sends it (add it later with this script)"
fi

echo "4/7 Pages project"
wr pages project create "$PROJECT" --production-branch main || true

echo "5/7 passwords (kept in Cloudflare as secrets; nothing is written to disk)"
if [ "$DRY" = 1 ]; then echo "+ (would ask for the inbox password${GATE:+, and the partner password})"; else
  printf "Choose the sales inbox password (user name: admin): "; stty -echo; read -r ADMIN_PW; stty echo; echo
  [ ${#ADMIN_PW} -ge 10 ] || { echo "use at least 10 characters" >&2; exit 65; }
  printf '%s' "$ADMIN_PW" | npx --yes wrangler@latest pages secret put ADMIN_PASSWORD --project-name "$PROJECT"
  if [ "$GATE" = 1 ]; then
    printf "Choose the partner password (user name: partner): "; stty -echo; read -r PREVIEW_PW; stty echo; echo
    printf '%s' "$PREVIEW_PW" | npx --yes wrangler@latest pages secret put PREVIEW_PASSWORD --project-name "$PROJECT"
  fi
fi

echo "6/7 enquiries"
if [ "$OPEN" = 1 ]; then
  run python3 -c "import re; p='wrangler.toml'; s=open(p).read(); open(p,'w').write(re.sub(r'ACCEPT_ENQUIRIES = \"\\d\"','ACCEPT_ENQUIRIES = \"1\"',s))"
  echo "   enquiries OPEN"
else
  echo "   enquiries stay closed (rerun with --open-enquiries when someone is ready to answer them)"
fi

echo "7/7 publishing"
wr pages deploy /tmp/ganjineh-preview --project-name "$PROJECT" --branch main --commit-dirty=true

echo
echo "Done. Your site: https://$PROJECT.pages.dev   Sales inbox: https://$PROJECT.pages.dev/admin"
