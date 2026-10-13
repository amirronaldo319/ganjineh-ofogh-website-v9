#!/bin/sh
# Publishes the website files (and only those) to a PUBLIC GitHub Pages repo: https://<you>.github.io/<repo>/
# Why GitHub Pages: *.pages.dev and *.netlify.app are blocked by Iran's filtering; github.io is reachable.
#
#   sh tools/publish_github_pages.sh [repo-name]       (needs `gh auth login` once)
#
# The forms say "requests are not open" here: a static host cannot run the enquiry backend.
set -eu
cd "$(dirname "$0")/.."
REPO="${1:-ganjineh-ofogh}"
OWNER="$(gh api user --jq .login)"
WORK="$(mktemp -d)"

python3 tools/make_preview.py
cp -R /tmp/ganjineh-preview/. "$WORK/"
rm -f "$WORK/_headers" "$WORK/_redirects" "$WORK/_routes.json"      # Cloudflare-only files
touch "$WORK/.nojekyll"                                            # serve files exactly as they are
# The 404 page uses root-absolute asset paths; under /<repo>/ they need the prefix.
python3 - "$WORK/404.html" "/$REPO" <<'PY'
import re, sys
path, prefix = sys.argv[1], sys.argv[2]
s = open(path, encoding="utf-8").read()
s = re.sub(r'((?:href|src)=")/(?!/)', r'\1' + prefix + '/', s)
open(path, "w", encoding="utf-8").write(s)
PY

if ! gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  gh repo create "$OWNER/$REPO" --public --description "Ganjineh Ofogh: public preview of the website (static)" >/dev/null
fi
cd "$WORK"
git init -q -b main
git add -A
git -c user.name="$OWNER" -c user.email="$OWNER@users.noreply.github.com" commit -q -m "Publish preview"
git remote add origin "https://github.com/$OWNER/$REPO.git"
git push -q -f origin main
gh api -X POST "repos/$OWNER/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || \
  gh api -X PUT "repos/$OWNER/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || true
echo "Published: https://$OWNER.github.io/$REPO/   (the first build takes a minute or two)"
