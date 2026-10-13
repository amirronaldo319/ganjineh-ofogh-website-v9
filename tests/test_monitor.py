"""The monitor passes on a healthy site, fails and alerts when the site is down.

    python3 -m unittest tests/test_monitor.py
"""
import io
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
from contextlib import redirect_stdout
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import monitor  # noqa: E402

PDF = ROOT / "tests" / "fixtures" / "brochure-sample.pdf"


def start(port, **env):
    base = dict(os.environ, PORT=str(port), GO_DB_PATH=str(Path(tempfile.mkdtemp()) / "e.sqlite3"))
    p = subprocess.Popen([sys.executable, "server.py"], cwd=ROOT, env={**base, **env}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/api/status", timeout=1).read()
            return p
        except OSError:
            time.sleep(0.1)
    p.kill()
    raise RuntimeError("server did not start")


def run(*args):
    out = io.StringIO()
    with redirect_stdout(out):
        code = monitor.main(list(args))
    return code, out.getvalue()


class Hook(BaseHTTPRequestHandler):
    got = []

    def do_POST(self):
        Hook.got.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
        self.send_response(200)
        self.end_headers()

    def log_message(self, *a):
        pass


class MonitorTest(unittest.TestCase):
    def test_healthy_site_passes(self):
        p = start(8801, GO_ACCEPT_ENQUIRIES="1", GO_BROCHURE_PDF=str(PDF), GO_ADMIN_PASSWORD="x")
        try:
            code, out = run("http://127.0.0.1:8801", "--expect-intake", "--expect-brochure")
            self.assertEqual(code, 0, out)
            self.assertRegex(out, r"sitemap.xml — \d+ URLs")
            self.assertIn("private paths — not served", out)
            self.assertIn("home page assets", out)
        finally:
            p.kill()

    def test_expectations_are_enforced(self):
        p = start(8802)
        try:
            code, out = run("http://127.0.0.1:8802", "--expect-intake", "--expect-brochure")
            self.assertEqual(code, 1)
            self.assertIn("expected ON but the server reports OFF", out)
            self.assertIn("expected on file", out)
        finally:
            p.kill()

    def test_down_site_fails_and_tells_the_webhook(self):
        hook = HTTPServer(("127.0.0.1", 8803), Hook)
        threading.Thread(target=hook.serve_forever, daemon=True).start()
        try:
            code, out = run("http://127.0.0.1:8804", "--webhook", "http://127.0.0.1:8803/x")
            self.assertEqual(code, 1)
            self.assertIn("✗ sitemap.xml", out)
            self.assertEqual(len(Hook.got), 1)
            self.assertEqual(Hook.got[0]["status"], "fail")
            self.assertIn("sitemap.xml", Hook.got[0]["text"])
        finally:
            hook.shutdown()


if __name__ == "__main__":
    unittest.main()
