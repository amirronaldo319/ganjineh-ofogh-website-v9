"""Sales inbox for stored enquiries: a single server-rendered page, a status/note editor and a CSV export.

Served by server.py under /admin, only when GO_ADMIN_PASSWORD is set, only over HTTPS (or from this machine),
behind HTTP Basic auth. No JavaScript, no third-party requests. The page is in Persian: it is for the sales team.
"""
from __future__ import annotations

import csv
import hashlib
import hmac
import io
import sqlite3
from datetime import datetime
from html import escape
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

STATUSES = {
    "new": "جدید",
    "contacted": "تماس گرفته شد",
    "visit": "قرار بازدید",
    "closed": "بسته شد",
    "spam": "هرزنامه",
}
ROUTES = {"visit": "بازدید", "brochure": "بروشور (ایمیل)", "download": "دانلود بروشور", "advisor": "تماس مشاور"}
UNITS = {"residence-1": "واحد ۱", "residence-2": "واحد ۲", "residence-3": "واحد ۳", "residence-4": "واحد ۴",
         "type-a": "واحد ۱ (قدیمی)", "type-b": "واحد ۴ (قدیمی)", "type-c": "واحد ۳ (قدیمی)", "type-d": "واحد ۲ (قدیمی)"}
TEHRAN = ZoneInfo("Asia/Tehran")
FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
COLUMNS = ["reference", "created_at", "route", "name", "mobile", "email", "unit", "visit_type", "visit_date", "visit_time",
           "message", "page", "source", "campaign", "consent", "status", "note", "downloaded_at"]


def to_jalali(year: int, month: int, day: int) -> tuple[int, int, int]:
    """Gregorian → Jalali (the widely used 33-year-cycle arithmetic; checked against Nowruz 1403–1405)."""
    g_days = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = year + 1 if month > 2 else year
    days = 355666 + 365 * year + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400 + day + g_days[month - 1]
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    if days < 186:
        return jy, 1 + days // 31, 1 + days % 31
    return jy, 7 + (days - 186) // 30, 1 + (days - 186) % 30


def tehran_stamp(iso: str) -> str:
    """'2026-10-13T12:00:00+00:00' → '۱۴۰۵/۰۷/۲۱ ۱۵:۳۰' (Tehran time, Jalali date)."""
    try:
        moment = datetime.fromisoformat(iso).astimezone(TEHRAN)
    except ValueError:
        return iso
    jy, jm, jd = to_jalali(moment.year, moment.month, moment.day)
    return f"{jy:04d}/{jm:02d}/{jd:02d} {moment:%H:%M}".translate(FA_DIGITS)


def csrf_token(password: str) -> str:
    return hmac.new(password.encode(), b"ganjineh-admin-csrf", hashlib.sha256).hexdigest()[:32]


def fetch(connection: sqlite3.Connection, status: str = "", route: str = "") -> list[sqlite3.Row]:
    connection.row_factory = sqlite3.Row
    sql, args = "SELECT * FROM enquiries WHERE 1=1", []
    if status in STATUSES:
        sql += " AND status = ?"
        args.append(status)
    if route in ROUTES:
        sql += " AND route = ?"
        args.append(route)
    return connection.execute(sql + " ORDER BY created_at DESC LIMIT 1000", args).fetchall()


def counts(connection: sqlite3.Connection) -> dict[str, int]:
    return {row[0]: row[1] for row in connection.execute("SELECT status, COUNT(*) FROM enquiries GROUP BY status")}


def update(connection: sqlite3.Connection, reference: str, status: str, note: str) -> bool:
    if status not in STATUSES:
        return False
    cursor = connection.execute("UPDATE enquiries SET status = ?, note = ? WHERE reference = ?", (status, note[:500], reference))
    return cursor.rowcount == 1


def safe_cell(value: object) -> str:
    """Spreadsheet formula injection guard: a cell that starts with = + - @ would be run as a formula."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def export_csv(rows: list[sqlite3.Row]) -> bytes:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(COLUMNS)
    for row in rows:
        writer.writerow([safe_cell(row[c]) for c in COLUMNS])
    return b"\xef\xbb\xbf" + out.getvalue().encode("utf-8")      # BOM so Excel opens Persian text correctly


def tel_href(mobile: str) -> str:
    digits = "".join(c for c in mobile if c.isdigit())
    return "+" + digits if digits.startswith("98") else "+98" + digits.lstrip("0")


def detail(row: sqlite3.Row) -> str:
    parts = []
    if row["unit"]:
        parts.append(UNITS.get(row["unit"], row["unit"]))
    if row["route"] == "visit":
        kind = {"in-person": "حضوری", "phone": "تلفنی", "video": "تصویری"}.get(row["visit_type"] or "", "")
        when = " ".join(x for x in (row["visit_date"], row["visit_time"]) if x)
        parts.append(" · ".join(x for x in (kind, when) if x))
    if row["email"]:
        parts.append(row["email"])
    if row["message"]:
        parts.append(row["message"])
    return " — ".join(p for p in parts if p)


def page(connection: sqlite3.Connection, status: str, route: str, password: str, flash: str = "") -> bytes:
    rows = fetch(connection, status, route)
    totals = counts(connection)
    token = csrf_token(password)

    def link(label: str, **query: str) -> str:
        qs = urlencode({k: v for k, v in query.items() if v})
        current = (query.get("status", "") == status and query.get("route", "") == route)
        return f'<a href="/admin{"?" + qs if qs else ""}"{" aria-current=page" if current else ""}>{escape(label)}</a>'

    filters = " ".join([link("همه", route=route)] + [
        link(f"{label} ({totals.get(key, 0)})".translate(FA_DIGITS), status=key, route=route) for key, label in STATUSES.items()])
    routes = " ".join([link("همه‌ی انواع", status=status)] + [link(label, status=status, route=key) for key, label in ROUTES.items()])
    body = []
    for row in rows:
        options = "".join(f'<option value="{k}"{" selected" if k == row["status"] else ""}>{v}</option>' for k, v in STATUSES.items())
        mobile = escape(row["mobile"])
        dl = "✓ دانلود شد" if row["downloaded_at"] else ""
        body.append(
            f'<tr class="s-{escape(row["status"] or "new")}"><td>{tehran_stamp(row["created_at"])}</td>'
            f'<td><code>{escape(row["reference"])}</code></td><td>{ROUTES.get(row["route"], escape(row["route"]))}</td>'
            f'<td>{escape(row["name"])}</td><td dir="ltr"><a href="tel:{tel_href(row["mobile"])}">{mobile}</a></td>'
            f'<td>{escape(detail(row))} <small>{dl}</small></td>'
            f'<td><form method="post" action="/admin/update"><input type="hidden" name="csrf" value="{token}">'
            f'<input type="hidden" name="reference" value="{escape(row["reference"])}">'
            f'<input type="hidden" name="back" value="{escape(urlencode({"status": status, "route": route}))}">'
            f'<select name="status" aria-label="وضعیت">{options}</select>'
            f'<input name="note" value="{escape(row["note"] or "")}" maxlength="500" placeholder="یادداشت" aria-label="یادداشت">'
            f'<button>ذخیره</button></form></td></tr>')
    table = ("<table><thead><tr><th>زمان (تهران)</th><th>شماره پیگیری</th><th>نوع</th><th>نام</th><th>موبایل</th><th>جزئیات</th><th>پیگیری</th></tr></thead>"
             f"<tbody>{''.join(body)}</tbody></table>") if body else "<p class=empty>درخواستی در این فیلتر نیست.</p>"
    export = "/admin/export.csv" + ("?" + urlencode({k: v for k, v in (("status", status), ("route", route)) if v}) if status or route else "")
    html = f"""<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>درخواست‌ها · گنجینه افق</title><style>
@font-face{{font-family:Vazirmatn;src:url(/assets/fonts/Vazirmatn-normal-arabic.woff2) format('woff2');font-display:swap}}
:root{{color-scheme:light dark;--bg:#f4f1e8;--ink:#1d2622;--mut:#66705f;--line:#d8d2c0;--card:#fff;--acc:#8a6d2f}}
@media (prefers-color-scheme:dark){{:root{{--bg:#131a17;--ink:#ece7d8;--mut:#9aa392;--line:#2d3833;--card:#1a2420;--acc:#d3b66d}}}}
*{{box-sizing:border-box}}body{{margin:0;font:15px/1.7 Vazirmatn,system-ui,sans-serif;background:var(--bg);color:var(--ink)}}
main{{max-width:1280px;margin:auto;padding:24px 16px 64px}}h1{{font-size:1.4rem;margin:0 0 4px}}p.sub{{color:var(--mut);margin:0 0 18px}}
nav.f{{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}}nav.f a{{padding:4px 12px;border:1px solid var(--line);border-radius:99px;color:var(--ink);text-decoration:none;background:var(--card)}}
nav.f a[aria-current]{{background:var(--acc);color:#fff;border-color:transparent}}.bar{{display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap}}
.export{{padding:8px 16px;border-radius:8px;background:var(--ink);color:var(--bg);text-decoration:none}}
.wrap{{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px;margin-top:14px}}
table{{border-collapse:collapse;width:100%;min-width:980px}}th,td{{padding:9px 12px;border-bottom:1px solid var(--line);text-align:start;vertical-align:top}}
th{{font-weight:600;color:var(--mut);font-size:.85rem;position:sticky;top:0;background:var(--card)}}td a{{color:var(--acc)}}code{{font-family:ui-monospace,monospace;font-size:.85rem}}
tr.s-closed,tr.s-spam{{opacity:.55}}td small{{color:var(--acc)}}form{{display:flex;gap:6px}}form input[name=note]{{flex:1;min-width:140px}}
select,input,button{{font:inherit;padding:4px 8px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}}button{{cursor:pointer;background:var(--acc);color:#fff;border:0}}
.flash{{background:var(--acc);color:#fff;padding:8px 14px;border-radius:8px;margin:10px 0}}.empty{{padding:28px;text-align:center;color:var(--mut)}}
</style></head><body><main><div class="bar"><div><h1>درخواست‌های ثبت‌شده</h1><p class="sub">{escape(str(len(rows))).translate(FA_DIGITS)} مورد نمایش داده می‌شود · فقط برای تیم فروش</p></div>
<a class="export" href="{export}">دریافت فایل CSV</a></div>{f'<p class="flash" role="status">{escape(flash)}</p>' if flash else ''}
<nav class="f" aria-label="فیلتر وضعیت">{filters}</nav><nav class="f" aria-label="فیلتر نوع">{routes}</nav>
<div class="wrap">{table}</div></main></body></html>"""
    return html.encode("utf-8")
