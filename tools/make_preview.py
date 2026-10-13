#!/usr/bin/env python3
"""Packs the public files into preview/ and preview.zip for a free static host (Cloudflare Pages, Netlify, …).

    python3 tools/make_preview.py

The preview is for sharing with partners, not for search engines: robots.txt disallows everything, every response carries
X-Robots-Tag: noindex, and there is no sitemap. Forms honestly say requests are not open, because the enquiry server
(server.py) does not run on a static host. For the real launch use the VPS plan in DEPLOY.md.
"""
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "preview"
INCLUDE_DIRS = ["assets", "en", "residences-3d", "tower-viewer"]
INCLUDE_FILES = ["favicon.svg"]            # plus every *.html in the root

HEADERS = """/*
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/assets/*
  Cache-Control: public, max-age=2592000

/*.html
  Cache-Control: no-cache
"""
REDIRECTS = "/en  /en/  301\n"


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    for name in INCLUDE_DIRS:
        shutil.copytree(ROOT / name, OUT / name, ignore=shutil.ignore_patterns("*.min.js.map", ".DS_Store"))
    for page in ROOT.glob("*.html"):
        shutil.copy2(page, OUT / page.name)
    for name in INCLUDE_FILES:
        shutil.copy2(ROOT / name, OUT / name)
    (OUT / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    (OUT / "_headers").write_text(HEADERS, encoding="utf-8")
    (OUT / "_redirects").write_text(REDIRECTS, encoding="utf-8")

    archive = ROOT / "preview.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(OUT.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(OUT))
    files = [f for f in OUT.rglob("*") if f.is_file()]
    biggest = max(files, key=lambda f: f.stat().st_size)
    total = sum(f.stat().st_size for f in files)
    print(f"preview/: {len(files)} files, {total / 1048576:.1f} MB; preview.zip {archive.stat().st_size / 1048576:.1f} MB; "
          f"largest {biggest.relative_to(OUT)} {biggest.stat().st_size / 1048576:.1f} MB")


if __name__ == "__main__":
    main()
