"""Small same-origin server for preview and opt-in local enquiry intake.

Set GO_ACCEPT_ENQUIRIES=1 only when someone will review the local database.
For public deployment, put this behind HTTPS and connect an approved sales workflow.
"""
from __future__ import annotations

import base64
import csv
import gzip
import hashlib
import hmac
import json
import os
import re
import smtplib
import sqlite3
import sys
import threading
import time
import urllib.request
import uuid
from email.message import EmailMessage
from collections import defaultdict, deque
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import admin

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get("GO_DB_PATH", ROOT / "var" / "enquiries.sqlite3"))
ACCEPTING = os.environ.get("GO_ACCEPT_ENQUIRIES") == "1"
# Set only when the app sits behind the reverse proxy (see deploy/); otherwise the header is spoofable.
TRUST_PROXY = os.environ.get("GO_TRUST_PROXY") == "1"
LIMIT = defaultdict(deque)
ALLOWED_ROUTES = {"visit", "brochure", "advisor", "download"}
# "download" = leave a number, get the brochure PDF straight away. The PDF lives outside the public folders.
BROCHURE = Path(os.environ.get("GO_BROCHURE_PDF", ROOT / "var" / "brochure.pdf"))
DOWNLOAD_ROUTES = ("download", "brochure")
# Sales inbox (see admin.py). Off unless a password is set; refuses to run over plain HTTP outside this machine.
ADMIN_USER = os.environ.get("GO_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("GO_ADMIN_PASSWORD", "")
ADMIN_FAILS = defaultdict(deque)
# residence-1..4 are the v25 apartments; type-a..d are the V8 names kept so old links and stored enquiries stay valid.
ALLOWED_UNITS = {"", "residence-1", "residence-2", "residence-3", "residence-4", "type-a", "type-b", "type-c", "type-d"}
# Source, tests and deployment files are never served, even by this preview server.
PRIVATE_PREFIXES = ("/src/", "/tests/", "/tools/", "/deploy/", "/node_modules/", "/.git", "/__pycache__/", "/test-results/", "/reports/")
FRAMEABLE = ("/residences-3d/", "/tower-viewer/")
PHONE_RE = re.compile(r"^(?:0?9\d{9}|989\d{9})$")
REFERENCE_RE = re.compile(r"^[A-F0-9]{12}$")
REFERENCE_ROUTE = "/api/enquiries/"
LOOKUP_LIMIT = defaultdict(deque)
LOOKUPS_PER_HOUR = 120


# ── notification of new enquiries (both optional; neither can ever block or fail the visitor's request) ──
#   GO_NOTIFY_WEBHOOK   an https URL that receives the enquiry as JSON (Telegram/Slack/Zapier/n8n/your CRM)
#   GO_SMTP_HOST, GO_SMTP_PORT (587), GO_SMTP_USER, GO_SMTP_PASSWORD, GO_NOTIFY_TO, GO_NOTIFY_FROM  → an email per enquiry
NOTIFY_WEBHOOK = os.environ.get("GO_NOTIFY_WEBHOOK", "")
SMTP = {k: os.environ.get("GO_" + k, "") for k in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "NOTIFY_TO", "NOTIFY_FROM")}


def notify(record: dict) -> None:
    """Fire-and-forget: runs in a thread, logs failures, never raises."""
    def run():
        if NOTIFY_WEBHOOK.startswith("https://") or NOTIFY_WEBHOOK.startswith("http://127.0.0.1"):
            try:
                req = urllib.request.Request(NOTIFY_WEBHOOK, data=json.dumps(record, ensure_ascii=False).encode("utf-8"),
                                             headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
                urllib.request.urlopen(req, timeout=10).read()
            except Exception as error:  # noqa: BLE001 - a failed notification must not affect the request
                print("notify webhook failed:", error, file=sys.stderr)
        if SMTP["SMTP_HOST"] and SMTP["NOTIFY_TO"]:
            try:
                msg = EmailMessage()
                msg["Subject"] = f"[Ganjineh Ofogh] New {record['route']} request · {record['reference']}"
                msg["From"] = SMTP["NOTIFY_FROM"] or SMTP["SMTP_USER"] or "noreply@localhost"
                msg["To"] = SMTP["NOTIFY_TO"]
                msg.set_content("\n".join(f"{k}: {v}" for k, v in record.items() if v))
                with smtplib.SMTP(SMTP["SMTP_HOST"], int(SMTP["SMTP_PORT"] or 587), timeout=15) as smtp:
                    smtp.starttls()
                    if SMTP["SMTP_USER"]:
                        smtp.login(SMTP["SMTP_USER"], SMTP["SMTP_PASSWORD"])
                    smtp.send_message(msg)
            except Exception as error:  # noqa: BLE001
                print("notify email failed:", error, file=sys.stderr)
    if NOTIFY_WEBHOOK or SMTP["SMTP_HOST"]:
        threading.Thread(target=run, daemon=True).start()


def allow(history: deque, limit: int, window: float = 3600) -> bool:
    now = time.monotonic()
    while history and now - history[0] > window:
        history.popleft()
    if len(history) >= limit:
        return False
    history.append(now)
    return True


def inline_script_hashes() -> str:
    """CSP hashes for every inline <script> (incl. importmaps), recomputed at start so edits stay allowed."""
    hashes = set()
    for page in list(ROOT.glob("*.html")) + list(ROOT.glob("en/*.html")) + list(ROOT.glob("residences-3d/*.html")) + list(ROOT.glob("tower-viewer/*.html")):
        for attrs, body in re.findall(r"<script(\s[^>]*)?>(.*?)</script>", page.read_text(encoding="utf-8"), re.S):
            if "src=" in (attrs or "") or "ld+json" in (attrs or "") or not body.strip():
                continue
            hashes.add("'sha256-%s'" % base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode())
    return " ".join(sorted(hashes))


EXTRA_SCRIPT = " ".join(o for o in os.environ.get("GO_CSP_SCRIPT_ORIGINS", "").split() if o.startswith("https://"))
EXTRA_CONNECT = " ".join(o for o in os.environ.get("GO_CSP_CONNECT_ORIGINS", "").split() if o.startswith("https://"))


def content_security_policy(path: str) -> str:
    # Only the two 3D viewers may be framed, and only by this site.
    ancestors = "'self'" if path.startswith(FRAMEABLE) else "'none'"
    return (f"default-src 'self'; script-src 'self' {current_script_hashes()} {EXTRA_SCRIPT}; style-src 'self' 'unsafe-inline'; "
            f"img-src 'self' data: blob:; font-src 'self'; connect-src 'self' {EXTRA_CONNECT}; frame-src 'self'; "
            f"frame-ancestors {ancestors}; object-src 'none'; base-uri 'self'; form-action 'self'")


def cache_policy(path: str, query: str) -> str:
    """Versioned assets (?v=N) never change, so cache them for a year; HTML always revalidates."""
    if path.startswith("/assets/"):
        return "public, max-age=31536000, immutable" if "v=" in query else "public, max-age=2592000"
    return "no-cache"


GZIP_TYPES = {".html", ".css", ".js", ".mjs", ".json", ".svg", ".xml", ".txt", ".webmanifest"}
GZIP_MIN_BYTES = 1024
_GZIP_CACHE: dict = {}


def gzipped(file: Path) -> bytes:
    """Compressed copy of a text asset, rebuilt only when the file changes on disk."""
    stat = file.stat()
    stamp = (stat.st_mtime_ns, stat.st_size)
    hit = _GZIP_CACHE.get(str(file))
    if hit and hit[0] == stamp:
        return hit[1]
    body = gzip.compress(file.read_bytes(), compresslevel=6, mtime=0)
    _GZIP_CACHE[str(file)] = (stamp, body)
    return body


_HASH_CACHE = {"stamp": None, "value": ""}


def current_script_hashes() -> str:
    """Inline-script hashes, recomputed whenever a page changes on disk so edits never need a server restart."""
    stamp = tuple(sorted((str(p), p.stat().st_mtime_ns) for pattern in ("*.html", "en/*.html", "residences-3d/*.html", "tower-viewer/*.html")
                         for p in ROOT.glob(pattern)))
    if stamp != _HASH_CACHE["stamp"]:
        _HASH_CACHE.update(stamp=stamp, value=inline_script_hashes())
    return _HASH_CACHE["value"]
CSS_COMMENT = re.compile(r"/\*[^*]*\*+(?:[^/*][^*]*\*+)*/")


def minify_css(css: str) -> bytes:
    """Strip comments and collapse whitespace without touching calc() operators."""
    compact = CSS_COMMENT.sub("", css)
    compact = re.sub(r"[ \t]*\n[ \t]*", "\n", compact)
    compact = re.sub(r"[ \t]{2,}", " ", compact)
    compact = re.sub(r"\n{2,}", "\n", compact)
    return compact.strip().encode("utf-8")


def safe_css(url_path: str) -> Path | None:
    relative = url_path.lstrip("/")
    if not relative.endswith(".css") or Path(relative).is_absolute() or ".." in Path(relative).parts:
        return None
    candidate = (ROOT / relative).resolve()
    try:
        candidate.relative_to(ROOT)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def clean(value: object, limit: int = 200) -> str:
    return str(value or "").strip()[:limit]


def normalize_digits(value: str) -> str:
    return value.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789"))


def database() -> sqlite3.Connection:
    DB.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    connection = sqlite3.connect(DB)
    connection.execute("""CREATE TABLE IF NOT EXISTS enquiries (
        reference TEXT PRIMARY KEY, created_at TEXT NOT NULL, route TEXT NOT NULL,
        name TEXT NOT NULL, mobile TEXT NOT NULL, email TEXT, unit TEXT,
        visit_type TEXT, visit_date TEXT, visit_time TEXT, message TEXT,
        page TEXT, source TEXT, campaign TEXT, consent INTEGER NOT NULL
    )""")
    have = {row[1] for row in connection.execute("PRAGMA table_info(enquiries)")}
    for column, ddl in (("status", "TEXT NOT NULL DEFAULT 'new'"), ("note", "TEXT NOT NULL DEFAULT ''"), ("downloaded_at", "TEXT")):
        if column not in have:
            connection.execute(f"ALTER TABLE enquiries ADD COLUMN {column} {ddl}")
    connection.commit()
    return connection


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def client_ip(self) -> str:
        # Behind the proxy every request comes from 127.0.0.1; the proxy appends the real client last.
        if TRUST_PROXY:
            forwarded = self.headers.get("X-Forwarded-For", "")
            if forwarded:
                return forwarded.split(",")[-1].strip()
        return self.client_address[0]

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        url = urlsplit(self.path)
        frame_policy = "SAMEORIGIN" if url.path.startswith(FRAMEABLE) else "DENY"
        self.send_header("X-Frame-Options", frame_policy)
        if not url.path.startswith("/api/"):
            self.send_header("Cache-Control", cache_policy(url.path, url.query))
            self.send_header("Content-Security-Policy", content_security_policy(url.path))
        # Browsers only honour HSTS over HTTPS, so this is inert on the local preview.
        self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        super().end_headers()

    def log_message(self, format, *args):
        # Never log query strings, submitted values, or enquiry references.
        path = urlsplit(self.path).path
        if path.startswith(REFERENCE_ROUTE):
            path = REFERENCE_ROUTE + ":reference"
        print(self.client_ip(), self.command, path)

    def json_response(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error(self, code, message=None, explain=None):
        if code == 404 and not urlsplit(self.path).path.startswith("/api/"):
            english = urlsplit(self.path).path.startswith("/en/") and (ROOT / "en" / "404.html").exists()
            body = (ROOT / ("en/404.html" if english else "404.html")).read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().send_error(code, message, explain)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/status":
            return self.json_response(200, {"acceptingEnquiries": ACCEPTING, "brochureAvailable": BROCHURE.is_file()})
        if path in ("/admin", "/admin/") or path.startswith("/admin/export"):
            return self.admin_get(path)
        if path.startswith("/api/brochure/"):
            return self.send_brochure(path[len("/api/brochure/"):])
        if path.startswith(REFERENCE_ROUTE):
            return self.verify_reference(path[len(REFERENCE_ROUTE):])
        if path.startswith("/api/") or path.startswith("/var/") or path in {"/server.py", "/admin.py", "/README.md"} or path.startswith(PRIVATE_PREFIXES):
            return self.send_error(404)
        css = None if path.endswith(".min.css") else safe_css(path)
        if css:
            body = minify_css(css.read_text(encoding="utf-8"))
            self.send_response(200)
            self.send_header("Content-Type", "text/css; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.send_compressed(path):
            return
        return super().do_GET()

    def send_compressed(self, path: str) -> bool:
        """Serve text assets gzipped when the browser accepts it; everything else falls through."""
        if "gzip" not in self.headers.get("Accept-Encoding", ""):
            return False
        file = Path(self.translate_path(path))
        if file.is_dir():
            file = file / "index.html"
        if file.suffix not in GZIP_TYPES or not file.is_file() or file.stat().st_size < GZIP_MIN_BYTES:
            return False
        body = gzipped(file)
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(str(file)) + ("; charset=utf-8" if file.suffix in {".html", ".css", ".js", ".mjs", ".json", ".txt", ".svg", ".xml"} else ""))
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Vary", "Accept-Encoding")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return True

    def verify_reference(self, reference: str):
        """Report only whether a reference exists; enquiry contents are never returned."""
        if not REFERENCE_RE.fullmatch(reference):
            return self.json_response(400, {"error": "شماره پیگیری معتبر نیست."})
        if not allow(LOOKUP_LIMIT[self.client_ip()], LOOKUPS_PER_HOUR):
            return self.json_response(429, {"error": "درخواست‌های زیادی ارسال شده است. بعداً دوباره تلاش کنید."})
        found = None
        if DB.exists():
            connection = database()
            try:
                found = connection.execute("SELECT route FROM enquiries WHERE reference = ?", (reference,)).fetchone()
            finally:
                connection.close()
        # Only the kind of request and whether a brochure is on offer are revealed, never what the visitor wrote.
        return self.json_response(200, {"exists": found is not None, "route": found[0] if found else "",
                                        "download": bool(found and found[0] in DOWNLOAD_ROUTES and BROCHURE.is_file())})

    def send_brochure(self, reference: str):
        """The PDF is served only to someone holding the reference of a stored brochure request."""
        if not REFERENCE_RE.fullmatch(reference) or not allow(LOOKUP_LIMIT[self.client_ip()], LOOKUPS_PER_HOUR):
            return self.json_response(404, {"error": "not found"})
        if not BROCHURE.is_file() or not DB.exists():
            return self.json_response(404, {"error": "not found"})
        with database() as connection:
            row = connection.execute("SELECT route FROM enquiries WHERE reference = ?", (reference,)).fetchone()
            if not row or row[0] not in DOWNLOAD_ROUTES:
                return self.json_response(404, {"error": "not found"})
            connection.execute("UPDATE enquiries SET downloaded_at = COALESCE(downloaded_at, ?) WHERE reference = ?",
                               (datetime.now(timezone.utc).isoformat(), reference))
        body = BROCHURE.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Disposition", 'attachment; filename="Ganjineh-Ofogh-brochure.pdf"')
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Robots-Tag", "noindex")
        self.end_headers()
        self.wfile.write(body)

    # ── sales inbox ──
    def admin_allowed(self) -> bool:
        """Basic auth sends the password with every request, so it is accepted only over HTTPS (via the proxy) or from this machine."""
        if not ADMIN_PASSWORD:
            return False
        if TRUST_PROXY:
            return self.headers.get("X-Forwarded-Proto", "") == "https"
        return self.client_address[0] in ("127.0.0.1", "::1")

    def admin_authenticated(self) -> bool:
        failures, now = ADMIN_FAILS[self.client_ip()], time.monotonic()
        while failures and now - failures[0] > 3600:
            failures.popleft()
        if len(failures) >= 10:
            self.json_response(429, {"error": "too many attempts"})
            return False
        header = self.headers.get("Authorization", "")
        try:
            user, _, password = base64.b64decode(header.split(" ", 1)[1]).decode("utf-8").partition(":") if header.startswith("Basic ") else ("", "", "")
        except (ValueError, UnicodeError, IndexError):
            user = password = ""
        if hmac.compare_digest(user.encode(), ADMIN_USER.encode()) and hmac.compare_digest(password.encode(), ADMIN_PASSWORD.encode()):
            return True
        failures.append(now)
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="Ganjineh Ofogh sales", charset="UTF-8"')
        self.send_header("Content-Length", "0")
        self.end_headers()
        return False

    def admin_reply(self, status: int, body: bytes, content_type: str = "text/html; charset=utf-8", extra: dict | None = None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def admin_get(self, path: str):
        path = "/admin" if path == "/admin/" else path
        if not self.admin_allowed():
            return self.send_error(404)
        if not self.admin_authenticated():
            return
        query = parse_qs(urlsplit(self.path).query)
        status, route = (query.get("status", [""])[0], query.get("route", [""])[0])
        with database() as connection:
            if path == "/admin/export.csv":
                body = admin.export_csv(admin.fetch(connection, status, route))
                return self.admin_reply(200, body, "text/csv; charset=utf-8", {"Content-Disposition": 'attachment; filename="enquiries.csv"'})
            if path == "/admin":
                return self.admin_reply(200, admin.page(connection, status, route, ADMIN_PASSWORD, query.get("saved", [""])[0] and "ذخیره شد."))
        return self.send_error(404)

    def admin_post(self):
        if not self.admin_allowed() or not self.admin_authenticated():
            return
        origin = self.headers.get("Origin")
        if origin and urlsplit(origin).netloc != self.headers.get("Host"):
            return self.json_response(403, {"error": "origin"})
        size = int(self.headers.get("Content-Length", "0") or "0")
        if not 1 <= size <= 4096:
            return self.json_response(413, {"error": "size"})
        form = {k: v[0] for k, v in parse_qs(self.rfile.read(size).decode("utf-8", "replace")).items()}
        if not hmac.compare_digest(form.get("csrf", ""), admin.csrf_token(ADMIN_PASSWORD)):
            return self.json_response(403, {"error": "csrf"})
        with database() as connection:
            ok = REFERENCE_RE.fullmatch(form.get("reference", "")) and admin.update(connection, form["reference"], form.get("status", ""), form.get("note", "").strip())
        if not ok:
            return self.json_response(422, {"error": "invalid"})
        back = form.get("back", "")
        self.send_response(303)
        self.send_header("Location", "/admin?" + (back + "&" if back else "") + "saved=1")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        if urlsplit(self.path).path == "/admin/update":
            return self.admin_post()
        if urlsplit(self.path).path != "/api/enquiries":
            return self.send_error(404)
        if not ACCEPTING:
            return self.json_response(503, {"error": "پذیرش درخواست در حال حاضر فعال نیست."})
        origin = self.headers.get("Origin")
        if origin and urlsplit(origin).netloc != self.headers.get("Host"):
            return self.json_response(403, {"error": "درخواست از این مبدأ پذیرفته نمی‌شود."})
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self.json_response(415, {"error": "قالب درخواست معتبر نیست."})
        size = int(self.headers.get("Content-Length", "0") or "0")
        if not 1 <= size <= 8192:
            return self.json_response(413, {"error": "حجم درخواست معتبر نیست."})
        now = time.monotonic()
        history = LIMIT[self.client_ip()]
        while history and now - history[0] > 3600:
            history.popleft()
        if len(history) >= 10:
            return self.json_response(429, {"error": "درخواست‌های زیادی ثبت شده است. بعداً دوباره تلاش کنید."})
        try:
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError()
        except (ValueError, UnicodeError):
            return self.json_response(400, {"error": "اطلاعات درخواست خوانده نشد."})
        if clean(data.get("website")):
            return self.json_response(400, {"error": "درخواست پذیرفته نشد."})
        route = clean(data.get("route"), 20)
        name = clean(data.get("name"), 100)
        mobile = re.sub(r"\D", "", normalize_digits(clean(data.get("mobile"), 30)))
        email = clean(data.get("email"), 200)
        unit = clean(data.get("residence-interest"), 20)
        consent = data.get("consent") == "yes"
        if route not in ALLOWED_ROUTES or unit not in ALLOWED_UNITS or not 2 <= len(name) <= 100 or not PHONE_RE.fullmatch(mobile) or not consent:
            return self.json_response(422, {"error": "نام، شماره موبایل و رضایت ثبت اطلاعات را بررسی کنید."})
        if route == "brochure" and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            return self.json_response(422, {"error": "برای درخواست بروشور، ایمیل معتبر وارد کنید."})
        visit_type = clean(data.get("visit-type"), 20) if route == "visit" else ""
        if visit_type and visit_type not in {"in-person", "phone", "video"}:
            return self.json_response(422, {"error": "نوع بازدید معتبر نیست."})
        visit_date = clean(data.get("visit-date"), 10) if route == "visit" else ""
        visit_time = clean(data.get("visit-time"), 5) if route == "visit" else ""
        if visit_date and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", visit_date):
            return self.json_response(422, {"error": "تاریخ پیشنهادی معتبر نیست."})
        if visit_time and not re.fullmatch(r"\d{2}:\d{2}", visit_time):
            return self.json_response(422, {"error": "ساعت پیشنهادی معتبر نیست."})
        reference = uuid.uuid4().hex[:12].upper()
        row = (reference, datetime.now(timezone.utc).isoformat(), route, name, mobile, email, unit,
               visit_type, visit_date, visit_time, clean(data.get("message"), 2000),
               clean(data.get("page"), 200), clean(data.get("source"), 100),
               clean(data.get("campaign"), 100), 1)
        with database() as connection:
            connection.execute("INSERT INTO enquiries (reference, created_at, route, name, mobile, email, unit, visit_type, visit_date, "
                               "visit_time, message, page, source, campaign, consent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", row)
        history.append(now)
        notify({"reference": reference, "created_at": row[1], "route": route, "name": name, "mobile": mobile, "email": email,
                "residence": unit, "visit_type": visit_type, "visit_date": visit_date, "visit_time": visit_time,
                "message": clean(data.get("message"), 2000), "page": clean(data.get("page"), 200)})
        return self.json_response(201, {"reference": reference})


def export_csv():
    if not DB.exists():
        print("No enquiries stored.")
        return
    with database() as connection:
        cursor = connection.execute("SELECT * FROM enquiries ORDER BY created_at DESC")
        writer = csv.writer(sys.stdout)
        writer.writerow([item[0] for item in cursor.description])
        writer.writerows(cursor)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "export":
        export_csv()
    else:
        port = int(os.environ.get("PORT", "8000"))
        print(f"Preview at http://127.0.0.1:{port}/ | enquiry intake {'ON' if ACCEPTING else 'OFF'}")
        class Server(ThreadingHTTPServer):
            request_queue_size = 128   # a gallery page fires ~40 image requests at once; the default backlog (5) resets some
            daemon_threads = True

        Server(("127.0.0.1", port), Handler).serve_forever()
