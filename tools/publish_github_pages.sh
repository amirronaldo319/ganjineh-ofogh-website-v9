#!/bin/sh
# Publishes the built website to the PUBLIC GitHub Pages repo (https://<you>.github.io/<repo>/) as ONE NEW COMMIT on top
# of that repo's history. It never force-pushes, so every earlier publish stays there and can be restored.
# Why GitHub Pages: *.pages.dev and *.netlify.app are blocked by Iran's filtering; github.io is reachable.
#
#   sh tools/publish_github_pages.sh                 dry run: checks, prepares, shows what would change. Publishes nothing.
#   sh tools/publish_github_pages.sh --push          the same, then publishes after you type the repo name
#   sh tools/publish_github_pages.sh [--push] name   another repo name (default: ganjineh-ofogh)
#
# THE RULE: the Pages repo holds generated files only. Make every change here (src/, assets/, tools/), run
# `python3 tools/build_site.py`, commit, then publish. A fix typed straight into the Pages repo is replaced by the next
# publish; the dry run lists such differences, and --push stops to ask when the last Pages commit was not made by this script.
#
# Undo a publish:  in a clone of the Pages repo, `git revert <publish commit>` and push (a normal push), or check out the
# earlier source commit here and publish again. Returning visitors pick either up on their next visit (new sw.js version).
#
# The forms say "requests are not open" on this host: a static host cannot run the enquiry backend.
# PAGES_REMOTE=<url or path> overrides the repo address (used to rehearse against a local clone).
set -eu
cd "$(dirname "$0")/.."

PUSH=0
REPO="ganjineh-ofogh"
for arg in "$@"; do
  case "$arg" in
    --push) PUSH=1 ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) REPO="$arg" ;;
  esac
done
BRANCH="main"
stop() { echo "STOPPED: $*" >&2; exit 1; }

# 1. What is published must be what is committed here, and the built pages must match their source.
SOURCE_SHA="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain)" ]; then
  [ "$PUSH" = 1 ] && stop "this folder has uncommitted changes. Commit them first, so the publish can name the commit it came from."
  echo "note: uncommitted changes here; this dry run includes them, --push would refuse."
  SOURCE_SHA="$SOURCE_SHA+uncommitted"
fi
python3 -m unittest tests.test_build_fresh >/dev/null 2>&1 || {
  python3 -m unittest tests.test_build_fresh 2>&1 | tail -15 >&2
  stop "the built pages do not match the source. Run: python3 tools/build_site.py (then commit) and try again."
}

# 2. The files to publish (and only those).
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
python3 tools/make_preview.py >/dev/null
mkdir "$WORK/site"
cp -R /tmp/ganjineh-preview/. "$WORK/site/"
rm -f "$WORK/site/_headers" "$WORK/site/_redirects" "$WORK/site/_routes.json"      # Cloudflare-only files
touch "$WORK/site/.nojekyll"                                                       # serve files exactly as they are
# The 404 page uses root-absolute asset paths; under /<repo>/ they need the prefix.
python3 - "$WORK/site/404.html" "/$REPO" <<'PY'
import re, sys
path, prefix = sys.argv[1], sys.argv[2]
s = open(path, encoding="utf-8").read()
s = re.sub(r'((?:href|src)=")/(?!/)', r'\1' + prefix + '/', s)
open(path, "w", encoding="utf-8").write(s)
PY

# 3. The Pages repo as it is now, with its history.
if [ -n "${PAGES_REMOTE:-}" ]; then
  REMOTE="$PAGES_REMOTE"
else
  OWNER="$(gh api user --jq .login)" || stop "GitHub login needed once: gh auth login"
  REMOTE="https://github.com/$OWNER/$REPO.git"
fi
git clone -q --depth 5 --branch "$BRANCH" "$REMOTE" "$WORK/pages" 2>/dev/null \
  || stop "could not fetch $REMOTE ($BRANCH). If the repo does not exist yet, create it once on GitHub (public, Pages from main) and publish again."
LAST="$(git -C "$WORK/pages" log -1 --format='%h %s')"
BY_SCRIPT="$(git -C "$WORK/pages" log -1 --format=%B | grep -c '^Source-commit: ' || true)"

# 4. Put the new build in place of the old files and look at the difference.
git -C "$WORK/pages" rm -rq --ignore-unmatch .
cp -R "$WORK/site/." "$WORK/pages/"
git -C "$WORK/pages" add -A
CHANGED="$(git -C "$WORK/pages" diff --cached --name-status | wc -l | tr -d ' ')"

echo "Pages repo:  $REMOTE ($BRANCH)"
echo "Last commit: $LAST"
echo "This build:  source commit $SOURCE_SHA"
if [ "$CHANGED" = 0 ]; then
  echo "Nothing to publish: the Pages repo already has exactly this build."
  exit 0
fi
echo "Files that would change: $CHANGED   (A = new, M = changed, D = removed)"
git -C "$WORK/pages" diff --cached --name-status | sed 's/^/  /' | head -60
[ "$CHANGED" -gt 60 ] && echo "  … and $((CHANGED - 60)) more"
if [ "$BY_SCRIPT" = 0 ]; then
  echo ""
  echo "WARNING: the last commit in the Pages repo was not made by this script (\"$LAST\")."
  echo "         If it was a fix made by hand, make the same fix in this folder first, or it is lost. See every line with:"
  echo "         git -C $WORK/pages diff --cached"
fi

if [ "$PUSH" != 1 ]; then
  echo ""
  echo "DRY RUN: nothing was published. The prepared files are in $WORK/pages (git -C $WORK/pages diff --cached)."
  echo "To publish: sh tools/publish_github_pages.sh --push"
  trap - EXIT
  exit 0
fi

# 5. Publish: one commit on top, a plain push. If someone else pushed meanwhile, git refuses and nothing is lost.
printf '\nType the repo name (%s) to publish these %s files: ' "$REPO" "$CHANGED"
read -r ANSWER
[ "$ANSWER" = "$REPO" ] || stop "not confirmed; nothing was published."
git -C "$WORK/pages" -c user.name="publish script" -c user.email="publish@users.noreply.github.com" \
  commit -q -m "Publish $SOURCE_SHA" -m "Source-commit: $(git rev-parse HEAD)"
git -C "$WORK/pages" push -q origin "HEAD:$BRANCH" || stop "the push was refused (the Pages repo changed meanwhile?). Nothing was overwritten; run the dry run again."
echo "Published $(git -C "$WORK/pages" log -1 --format=%h): the Pages build takes a minute or two."
echo "Undo: git revert $(git -C "$WORK/pages" log -1 --format=%h) in a clone of the Pages repo, then push."
