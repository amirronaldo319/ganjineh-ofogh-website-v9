#!/usr/bin/env python3
"""Daily digest of enquiries for the sales team: what came in, and what is still waiting for a first call.

    python3 tools/digest.py                          # reads var/enquiries.sqlite3 (or GO_DB_PATH), prints the digest
    python3 tools/digest.py --webhook https://…      # also posts it (JSON with a "text" line, like the monitor)
    python3 tools/digest.py --cloudflare             # reads the Cloudflare D1 database via wrangler (needs CLOUDFLARE_API_TOKEN)
    python3 tools/digest.py --hours 24 --stale-hours 4

"Waiting" means status `new` and older than --stale-hours (default 4): nobody has marked it contacted yet.
Names and numbers go only to the destination you give; nothing is stored elsewhere.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROUTES = {"visit": "بازدید", "brochure": "بروشور (ایمیل)", "download": "دانلود بروشور", "advisor": "تماس مشاور"}
FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def load_sqlite(path: Path) -> list[dict]:
    if not path.exists():
        return []
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in connection.execute("SELECT reference, created_at, route, name, mobile, unit, status FROM enquiries ORDER BY created_at DESC")]
    finally:
        connection.close()


def load_cloudflare() -> list[dict]:
    out = subprocess.run(["npx", "--yes", "wrangler@latest", "d1", "execute", "ganjineh-enquiries", "--remote", "--json", "--command",
                          "SELECT reference, created_at, route, name, mobile, unit, status FROM enquiries ORDER BY created_at DESC LIMIT 2000"],
                         capture_output=True, text=True, cwd=ROOT)
    if out.returncode:
        raise SystemExit("could not read D1: " + out.stderr.strip()[-300:])
    return json.loads(out.stdout)[0]["results"]


def build(rows: list[dict], now: datetime, hours: int, stale_hours: int) -> tuple[str, dict]:
    def age(r):
        return now - datetime.fromisoformat(r["created_at"])
    fresh = [r for r in rows if age(r) <= timedelta(hours=hours)]
    waiting = [r for r in rows if (r.get("status") or "new") == "new" and age(r) > timedelta(hours=stale_hours)]
    by_route: dict[str, int] = {}
    for r in fresh:
        by_route[r["route"]] = by_route.get(r["route"], 0) + 1
    lines = [f"درخواست‌های {hours} ساعت گذشته: {len(fresh)}".translate(FA)]
    lines += [f"  · {ROUTES.get(k, k)}: {v}".translate(FA) for k, v in sorted(by_route.items())]
    if waiting:
        lines.append(f"منتظر نخستین تماس (بیش از {stale_hours} ساعت): {len(waiting)}".translate(FA))
        for r in waiting[:15]:
            lines.append(f"  · {r['name']} · {r['mobile']} · {ROUTES.get(r['route'], r['route'])} · {r['reference']}")
        if len(waiting) > 15:
            lines.append(f"  … و {len(waiting) - 15} مورد دیگر".translate(FA))
    else:
        lines.append("هیچ درخواستی منتظر نخستین تماس نیست.")
    return "\n".join(lines), {"new": len(fresh), "waiting": len(waiting), "by_route": by_route}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--stale-hours", type=int, default=4)
    parser.add_argument("--webhook", default=os.environ.get("GO_NOTIFY_WEBHOOK", ""))
    parser.add_argument("--cloudflare", action="store_true")
    parser.add_argument("--db", default=os.environ.get("GO_DB_PATH", str(ROOT / "var" / "enquiries.sqlite3")))
    args = parser.parse_args(argv)

    rows = load_cloudflare() if args.cloudflare else load_sqlite(Path(args.db))
    text, stats = build(rows, datetime.now(timezone.utc), args.hours, args.stale_hours)
    print(text)
    if args.webhook.startswith(("https://", "http://127.0.0.1")):
        body = json.dumps({"type": "digest", "text": text, **stats}, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(args.webhook, data=body, headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
        try:
            urllib.request.urlopen(req, timeout=10).read()
        except OSError as error:
            print(f"digest could not be sent: {error}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
