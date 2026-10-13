"""The digest counts the last day's enquiries and lists the ones still waiting for a first call.

    python3 -m unittest tests/test_digest.py
"""
import json
import sqlite3
import sys
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import digest  # noqa: E402

NOW = datetime(2026, 10, 14, 6, 0, tzinfo=timezone.utc)


def make_db(rows):
    path = Path(tempfile.mkdtemp()) / "e.sqlite3"
    c = sqlite3.connect(path)
    c.execute("CREATE TABLE enquiries (reference TEXT, created_at TEXT, route TEXT, name TEXT, mobile TEXT, unit TEXT, status TEXT)")
    c.executemany("INSERT INTO enquiries VALUES (?,?,?,?,?,?,?)", rows)
    c.commit()
    c.close()
    return path


def at(hours_ago):
    return (NOW - timedelta(hours=hours_ago)).isoformat()


class DigestTest(unittest.TestCase):
    def test_counts_and_waiting(self):
        path = make_db([
            ("A" * 12, at(1), "visit", "Sara", "09121234567", "residence-2", "new"),        # fresh, not stale yet
            ("B" * 12, at(6), "download", "Reza", "09129999999", "", "new"),                # waiting
            ("C" * 12, at(10), "advisor", "Mina", "09120000000", "", "contacted"),          # handled
            ("D" * 12, at(50), "visit", "Old", "09121111111", "", "new"),                   # waiting, not in the last day
        ])
        text, stats = digest.build(digest.load_sqlite(path), NOW, 24, 4)
        self.assertEqual(stats["new"], 3)
        self.assertEqual(stats["waiting"], 2)
        self.assertEqual(stats["by_route"], {"visit": 1, "download": 1, "advisor": 1})
        self.assertIn("Reza", text)
        self.assertIn("Old", text)
        self.assertNotIn("Mina", text)

    def test_quiet_day(self):
        text, stats = digest.build(digest.load_sqlite(make_db([])), NOW, 24, 4)
        self.assertEqual((stats["new"], stats["waiting"]), (0, 0))
        self.assertIn("هیچ درخواستی منتظر", text)

    def test_missing_database_is_an_empty_digest(self):
        self.assertEqual(digest.load_sqlite(Path("/nonexistent/x.sqlite3")), [])

    def test_posts_to_the_webhook(self):
        got = []

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                got.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
                self.send_response(200)
                self.end_headers()

            def log_message(self, *a):
                pass

        srv = HTTPServer(("127.0.0.1", 8841), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            path = make_db([("A" * 12, (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(), "visit", "Sara", "09121234567", "", "new")])
            self.assertEqual(digest.main(["--db", str(path), "--webhook", "http://127.0.0.1:8841/x"]), 0)
        finally:
            srv.shutdown()
        self.assertEqual(got[0]["type"], "digest")
        self.assertEqual(got[0]["new"], 1)


if __name__ == "__main__":
    unittest.main()
