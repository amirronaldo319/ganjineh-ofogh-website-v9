#!/usr/bin/env python3
"""Uptime and health check for the live site. Standard library only, so it runs on the server itself.

    python3 tools/monitor.py https://ganjinehofogh.ir
    python3 tools/monitor.py https://ganjinehofogh.ir --expect-intake --expect-brochure --webhook https://…

Checks every page in sitemap.xml (status, title, canonical, language, speed), the assets the home page needs, /api/status,
robots.txt, security headers, the HTTPS certificate's remaining life, the http→https redirect, and that private paths
(source files, the database, /admin without credentials) are not served.

Exit code: 0 all good · 1 something failed · 2 only warnings (1 with --strict). A webhook (--webhook or GO_NOTIFY_WEBHOOK)
is told when something fails, with a "text" line that Slack/Telegram bridges can show as is.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit

SLOW_SECONDS = 3.0
CERT_WARN_DAYS, CERT_FAIL_DAYS = 21, 7
PRIVATE = ["/server.py", "/admin.py", "/src/pages/index.html", "/tools/build_site.py", "/tests/e2e/pages.spec.js", "/var/enquiries.sqlite3", "/.git/config"]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def tls_context() -> ssl.SSLContext:
    """The default context; on macOS framework Pythons that ship without CA certificates, the system bundle instead."""
    context = ssl.create_default_context()
    if not context.cert_store_stats().get("x509_ca") and os.path.exists("/etc/ssl/cert.pem"):
        context = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    return context


TLS = tls_context()
OPENER = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=TLS))


def fetch(url: str, timeout: float = 15.0) -> tuple[int, dict, bytes, float]:
    """(status, lower-cased headers, body, seconds) — never raises for HTTP errors; raises OSError for network ones."""
    request = urllib.request.Request(url, headers={"User-Agent": "ganjineh-monitor/1", "Accept-Encoding": "gzip"})
    started = time.monotonic()
    try:
        with OPENER.open(request, timeout=timeout) as response:
            status, headers, body = response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        status, headers, body = error.code, error.headers, error.read()
    if headers.get("Content-Encoding") == "gzip":
        import gzip
        body = gzip.decompress(body)
    return status, {k.lower(): v for k, v in headers.items()}, body, time.monotonic() - started


class Report:
    def __init__(self):
        self.rows: list[tuple[str, str, str]] = []

    def add(self, level: str, name: str, detail: str = ""):
        self.rows.append((level, name, detail))

    ok = lambda self, name, detail="": self.add("ok", name, detail)          # noqa: E731
    warn = lambda self, name, detail="": self.add("warn", name, detail)      # noqa: E731
    fail = lambda self, name, detail="": self.add("fail", name, detail)      # noqa: E731

    def count(self, level: str) -> int:
        return sum(1 for r in self.rows if r[0] == level)


def check_page(report: Report, url: str, language: str):
    try:
        status, headers, body, seconds = fetch(url)
    except OSError as error:
        report.fail(url, f"unreachable: {error}")
        return
    html = body.decode("utf-8", "replace")
    problems = []
    if status != 200:
        problems.append(f"HTTP {status}")
    if not re.search(r"<title>[^<]{5,}</title>", html):
        problems.append("no <title>")
    if not re.search(r'<link rel="canonical" href="https://[^"]+">', html):
        problems.append("no canonical")
    if not re.search(rf'<html[^>]*\blang="{language}"', html):
        problems.append(f"lang is not {language}")
    if "<h1" not in html:
        problems.append("no <h1>")
    if problems:
        report.fail(url, ", ".join(problems))
    elif seconds > SLOW_SECONDS:
        report.warn(url, f"slow: {seconds:.1f}s")
    else:
        report.ok(url, f"{seconds * 1000:.0f} ms")


def check_certificate(report: Report, host: str, port: int):
    try:
        with socket.create_connection((host, port), timeout=10) as raw, TLS.wrap_socket(raw, server_hostname=host) as tls:
            expires = datetime.fromtimestamp(ssl.cert_time_to_seconds(tls.getpeercert()["notAfter"]), timezone.utc)
    except (OSError, ssl.SSLError, KeyError) as error:
        report.fail("HTTPS certificate", f"cannot verify: {error}")
        return
    days = (expires - datetime.now(timezone.utc)).days
    (report.fail if days < CERT_FAIL_DAYS else report.warn if days < CERT_WARN_DAYS else report.ok)("HTTPS certificate", f"expires in {days} days")


PREVIEW_PAGES = ["", "residences", "residence-1", "residence-2", "residence-3", "residence-4", "compare", "gallery", "project",
                 "architecture", "lifestyle", "location", "developer", "brochure", "contact", "faq", "privacy"]


def run_preview(base: str) -> Report:
    """The shared GitHub Pages preview: no sitemap, API, response headers or http→https redirect exist there by design,
    so only what can be true there is checked."""
    base = base.rstrip("/")
    parts = urlsplit(base)
    report = Report()
    for name in PREVIEW_PAGES:
        for lang, prefix in (("fa", ""), ("en", "en/")):
            path = "/" + prefix + (f"{name}.html" if name else ("" if lang == "fa" else ""))
            check_page(report, base + path, lang)
    try:
        status, _, home, _ = fetch(base + "/")
        assets = sorted(set(re.findall(r'(?:src|href)="(/?assets/[^"#?]+\.(?:css|js|woff2))', home.decode("utf-8", "replace"))))
        bad = [a for a in assets if fetch(urljoin(base + "/", a))[0] != 200]
        (report.fail if bad else report.ok)("home page assets", f"missing: {', '.join(bad)}" if bad else f"{len(assets)} files")
        status, _, worker, _ = fetch(base + "/sw.js")
        has_version = status == 200 and re.search(rb"VERSION = '[0-9a-f]{12}'", worker) is not None
        (report.ok if has_version else report.fail)("service worker", "sw.js served with a build version" if has_version else f"sw.js HTTP {status}")
    except OSError as error:
        report.fail("home page assets", str(error))
    leaked = []
    for path in PRIVATE:
        try:
            status = fetch(base + path)[0]
        except OSError:
            continue
        if status not in (404, 401, 403):
            leaked.append(f"{path} → {status}")
    (report.fail if leaked else report.ok)("private paths", "; ".join(leaked) if leaked else "not served")
    if parts.scheme == "https":
        check_certificate(report, parts.hostname, parts.port or 443)
    return report


def run(base: str, expect_intake: bool, expect_brochure: bool) -> Report:
    base = base.rstrip("/")
    parts = urlsplit(base)
    report = Report()

    # 1. every page in the sitemap
    try:
        status, _, body, _ = fetch(base + "/sitemap.xml")
        locs = re.findall(r"<loc>([^<]+)</loc>", body.decode("utf-8", "replace")) if status == 200 else []
    except OSError as error:
        report.fail("sitemap.xml", f"unreachable: {error}")
        return report
    if not locs:
        report.fail("sitemap.xml", f"HTTP {status} or no URLs")
    else:
        report.ok("sitemap.xml", f"{len(locs)} URLs")
    for loc in locs:
        path = urlsplit(loc).path or "/"
        check_page(report, base + path, "en" if path.startswith("/en/") else "fa")

    # 2. the assets the home page needs
    try:
        _, _, home, _ = fetch(base + "/")
        assets = sorted(set(re.findall(r'(?:src|href)="(/?assets/[^"#]+\.(?:css|js|woff2))[^"]*"', home.decode("utf-8", "replace"))))
        bad = [a for a in assets if fetch(urljoin(base + "/", a))[0] != 200]
        (report.fail if bad else report.ok)("home page assets", f"missing: {', '.join(bad)}" if bad else f"{len(assets)} files")
    except OSError as error:
        report.fail("home page assets", str(error))

    # 3. API and robots
    try:
        status, _, body, _ = fetch(base + "/api/status")
        data = json.loads(body) if status == 200 else {}
        if status != 200 or "acceptingEnquiries" not in data:
            report.fail("/api/status", f"HTTP {status}")
        else:
            report.ok("/api/status", f"intake {'ON' if data['acceptingEnquiries'] else 'OFF'}, brochure {'on file' if data.get('brochureAvailable') else 'not on file'}")
            if expect_intake and not data["acceptingEnquiries"]:
                report.fail("enquiry intake", "expected ON but the server reports OFF")
            if expect_brochure and not data.get("brochureAvailable"):
                report.fail("brochure PDF", "expected on file but the server has none")
    except (OSError, ValueError) as error:
        report.fail("/api/status", str(error))
    try:
        status, _, body, _ = fetch(base + "/robots.txt")
        (report.ok if status == 200 and b"Sitemap:" in body else report.fail)("robots.txt", f"HTTP {status}")
    except OSError as error:
        report.fail("robots.txt", str(error))

    # 4. security headers
    try:
        _, headers, _, _ = fetch(base + "/")
        missing = [h for h in ("content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy") if h not in headers]
        if parts.scheme == "https" and "strict-transport-security" not in headers:
            missing.append("strict-transport-security")
        (report.fail if missing else report.ok)("security headers", f"missing: {', '.join(missing)}" if missing else "present")
    except OSError as error:
        report.fail("security headers", str(error))

    # 5. private things stay private
    leaked = []
    for path in PRIVATE + ["/admin", "/admin/export.csv"]:
        try:
            status = fetch(base + path)[0]
        except OSError:
            continue
        if status not in (404, 401, 403):
            leaked.append(f"{path} → {status}")
    (report.fail if leaked else report.ok)("private paths", "; ".join(leaked) if leaked else "not served")

    # 6. HTTPS
    if parts.scheme == "https":
        check_certificate(report, parts.hostname, parts.port or 443)
        try:
            status, headers, _, _ = fetch(f"http://{parts.netloc}/")
            target = headers.get("location", "")
            (report.ok if status in (301, 308) and target.startswith("https://") else report.fail)("http → https", f"HTTP {status} {target}")
        except OSError as error:
            report.warn("http → https", f"port 80 not reachable: {error}")
    return report


def alert(webhook: str, base: str, report: Report):
    failures = [f"{name}: {detail}" if detail else name for level, name, detail in report.rows if level == "fail"]
    text = f"⚠ {base}: {len(failures)} check(s) failed — " + "; ".join(failures[:6])
    request = urllib.request.Request(webhook, data=json.dumps({"type": "monitor", "status": "fail", "site": base, "failures": failures, "text": text},
                                                              ensure_ascii=False).encode("utf-8"), headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
    try:
        urllib.request.urlopen(request, timeout=10).read()
    except OSError as error:
        print(f"alert could not be sent: {error}", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("url", help="site root, e.g. https://ganjinehofogh.ir")
    parser.add_argument("--expect-intake", action="store_true", help="fail if enquiry intake is OFF")
    parser.add_argument("--expect-brochure", action="store_true", help="fail if no brochure PDF is on file")
    parser.add_argument("--webhook", default=os.environ.get("GO_NOTIFY_WEBHOOK", ""), help="tell this https URL when a check fails")
    parser.add_argument("--strict", action="store_true", help="treat warnings as failures")
    parser.add_argument("--preview", action="store_true", help="the static GitHub Pages preview: skip checks that only a real server can pass")
    parser.add_argument("-q", "--quiet", action="store_true", help="print only problems")
    args = parser.parse_args(argv)

    report = run_preview(args.url) if args.preview else run(args.url, args.expect_intake, args.expect_brochure)
    icons = {"ok": "✓", "warn": "!", "fail": "✗"}
    for level, name, detail in report.rows:
        if level != "ok" or not args.quiet:
            print(f"{icons[level]} {name}{' — ' + detail if detail else ''}")
    fails, warns = report.count("fail"), report.count("warn")
    print(f"\n{report.count('ok')} ok, {warns} warning(s), {fails} failure(s) · {datetime.now().astimezone():%Y-%m-%d %H:%M %Z}")
    if fails and args.webhook.startswith(("https://", "http://127.0.0.1")):
        alert(args.webhook, args.url, report)
    return 1 if fails or (warns and args.strict) else 2 if warns else 0


if __name__ == "__main__":
    sys.exit(main())
