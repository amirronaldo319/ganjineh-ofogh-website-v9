#!/usr/bin/env python3
"""Readiness check before pointing a real domain at the site. Reads files only; changes nothing.

    python3 tools/launch_check.py                          # what is still open locally
    python3 tools/launch_check.py --url https://ganjinehofogh.ir   # also probe a deployed server

Exit code 0 = nothing blocks a public launch, 1 = at least one blocker. Blockers are things that would make the site
dishonest or unreachable (no way to contact sales, forms that say they are closed, search engines told to stay away).
"""
from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOCK, WARN, OK = "✗", "!", "✓"


def probe(url: str) -> dict:
    context = ssl.create_default_context()
    if not context.cert_store_stats().get("x509_ca") and Path("/etc/ssl/cert.pem").exists():
        context = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    with urllib.request.urlopen(url.rstrip("/") + "/api/status", timeout=10, context=context) as response:
        return json.loads(response.read())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="", help="a deployed site to probe for a working enquiry backend")
    args = parser.parse_args()
    cfg = json.loads((ROOT / "src" / "site.config.json").read_text(encoding="utf-8"))
    rows: list[tuple[str, str, str]] = []

    def add(level: str, name: str, detail: str = ""):
        rows.append((level, name, detail))

    # 1. address
    host = cfg.get("host", "")
    add(OK if host.startswith("https://") else BLOCK, "public address", host or "not set")
    add(WARN, "domain confirmed with the team?", "ganjinehofogh.ir is an assumption until A3 in launch/CONFIRM-IN-5-MINUTES.md is answered")

    # 2. a way to reach sales
    channels = [k for k in ("phone", "whatsapp", "telegram", "eitaa", "rubika", "email") if cfg.get(k)]
    add(OK if channels else BLOCK, "a way to reach sales", ", ".join(channels) if channels else "no phone, messenger or email configured")

    # 3. reply time must be both languages or none
    fa, en = bool(cfg.get("response_time_fa")), bool(cfg.get("response_time_en"))
    if fa and en:
        add(OK, "reply time", f"{cfg['response_time_en']}")
    elif fa != en:
        add(BLOCK, "reply time", "set in only one language; fill both or neither")
    else:
        add(WARN, "reply time", "empty: the thank-you page states no time (honest, but a stated time converts better)")

    # 4. enquiry backend
    mode = cfg.get("mode", "preview")
    backend = None
    if args.url:
        try:
            backend = probe(args.url)
            add(OK if backend.get("acceptingEnquiries") else BLOCK, "enquiry backend",
                f"{args.url}: intake {'ON' if backend.get('acceptingEnquiries') else 'OFF'}, brochure {'on file' if backend.get('brochureAvailable') else 'NOT on file'}")
        except (OSError, ValueError) as error:
            add(BLOCK, "enquiry backend", f"{args.url}/api/status unreachable: {error}")
    if mode == "live":
        add(OK if backend and backend.get("acceptingEnquiries") else BLOCK, "mode", "live (forms say requests are open)" + ("" if backend else "; probe with --url to confirm a backend answers"))
    else:
        add(BLOCK, "mode", 'still "preview": forms tell visitors requests are not open. Switch to "live" only after the backend is probed OK')

    # 5. search engines
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8") if (ROOT / "robots.txt").exists() else ""
    blocked_all = re.search(r"(?im)^Disallow:\s*/\s*$", robots) is not None
    add(BLOCK if blocked_all or not robots else OK, "robots.txt", "blocks everything" if blocked_all else "allows indexing" if robots else "missing (run tools/build_site.py)")
    sitemap = ROOT / "sitemap.xml"
    add(OK if sitemap.exists() and host in sitemap.read_text(encoding="utf-8") else BLOCK, "sitemap.xml", "uses the configured host" if sitemap.exists() else "missing")
    stray = [p.name for p in list(ROOT.glob("*.html")) + list(ROOT.glob("en/*.html"))
             if 'name="robots" content="noindex' in p.read_text(encoding="utf-8") and p.stem not in {"thank-you", "404"}]
    add(OK if not stray else BLOCK, "noindex on public pages", "none" if not stray else ", ".join(stray))

    # 6. unanswered launch-blocking questions
    checklist = ROOT / "launch" / "CONFIRM-IN-5-MINUTES.md"
    if checklist.exists():
        section = checklist.read_text(encoding="utf-8").split("## A.")[1].split("## B.")[0]
        open_rows = [line for line in section.splitlines() if re.match(r"^\| A\d", line) and line.rstrip().endswith("| |")]
        add(OK if not open_rows else WARN, "checklist section A", "all answered" if not open_rows else f"{len(open_rows)} of 4 still blank")

    # 7. wording that must never ship
    risky = [str(p.relative_to(ROOT)) for p in list(ROOT.glob("*.html")) + list(ROOT.glob("en/*.html")) if re.search(r"lorem|TODO|XXX|placeholder", p.read_text(encoding="utf-8"), re.I)]
    add(OK if not risky else BLOCK, "placeholder text", "none found" if not risky else ", ".join(risky[:5]))

    width = max(len(n) for _, n, _ in rows)
    for level, name, detail in rows:
        print(f"{level} {name.ljust(width)}  {detail}")
    blockers = sum(1 for level, _, _ in rows if level == BLOCK)
    print(f"\n{blockers} blocker(s)." if blockers else "\nNothing blocks a public launch.")
    return 1 if blockers else 0


if __name__ == "__main__":
    sys.exit(main())
