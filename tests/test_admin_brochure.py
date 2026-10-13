"""Brochure download, the sales inbox and Jalali conversion.

    python3 -m unittest tests/test_admin_brochure.py
"""
import base64
import http.client
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import admin  # noqa: E402

PDF = ROOT / "tests" / "fixtures" / "brochure-sample.pdf"
PASSWORD = "correct horse battery staple"
AUTH = {"Authorization": "Basic " + base64.b64encode(f"admin:{PASSWORD}".encode()).decode()}


class Server:
    def __init__(self, port, **env):
        self.port = port
        base = dict(os.environ, PORT=str(port), GO_ACCEPT_ENQUIRIES="1", GO_DB_PATH=str(Path(tempfile.mkdtemp()) / "e.sqlite3"))
        base.pop("GO_ADMIN_PASSWORD", None)
        base.pop("GO_BROCHURE_PDF", None)
        self.process = subprocess.Popen([sys.executable, "server.py"], cwd=ROOT, env={**base, **env}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(60):
            try:
                self.call("GET", "/api/status")
                return
            except OSError:
                time.sleep(0.1)
        self.process.kill()
        raise RuntimeError("server did not start")

    def call(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request(method, path, body=body, headers=headers or {})
        response = conn.getresponse()
        data = response.read()
        result = (response.status, dict(response.getheaders()), data)
        conn.close()
        return result

    def enquire(self, route="download", **extra):
        payload = {"route": route, "name": "Test Visitor", "mobile": "09121234567", "consent": "yes", **extra}
        status, _, data = self.call("POST", "/api/enquiries", json.dumps(payload), {"Content-Type": "application/json"})
        return status, json.loads(data)

    def stop(self):
        self.process.kill()


class BrochureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server(8793, GO_BROCHURE_PDF=str(PDF))

    @classmethod
    def tearDownClass(cls):
        cls.s.stop()

    def test_status_reports_brochure(self):
        self.assertTrue(json.loads(self.s.call("GET", "/api/status")[2])["brochureAvailable"])

    def test_download_needs_a_number_and_consent(self):
        status, _ = self.s.enquire(mobile="12345")
        self.assertEqual(status, 422)
        status, _ = self.s.enquire(consent="no")
        self.assertEqual(status, 422)

    def test_reference_unlocks_the_pdf_once_recorded(self):
        status, body = self.s.enquire()
        self.assertEqual(status, 201)
        ref = body["reference"]
        verify = json.loads(self.s.call("GET", f"/api/enquiries/{ref}")[2])
        self.assertEqual((verify["exists"], verify["route"], verify["download"]), (True, "download", True))
        status, headers, data = self.s.call("GET", f"/api/brochure/{ref}")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "application/pdf")
        self.assertIn("attachment", headers["Content-Disposition"])
        self.assertEqual(data, PDF.read_bytes())

    def test_other_references_get_nothing(self):
        self.assertEqual(self.s.call("GET", "/api/brochure/AAAAAAAAAAAA")[0], 404)
        self.assertEqual(self.s.call("GET", "/api/brochure/not-a-reference")[0], 404)
        _, body = self.s.enquire(route="advisor")
        self.assertEqual(self.s.call("GET", f"/api/brochure/{body['reference']}")[0], 404)
        verify = json.loads(self.s.call("GET", f"/api/enquiries/{body['reference']}")[2])
        self.assertFalse(verify["download"])

    def test_private_files_are_not_served(self):
        for path in ("/server.py", "/admin.py", "/src/pages/index.html", "/tools/build_site.py", "/tests/fixtures/brochure-sample.pdf", "/var/enquiries.sqlite3"):
            self.assertEqual(self.s.call("GET", path)[0], 404, path)


class NoBrochureTest(unittest.TestCase):
    def test_without_a_pdf_nothing_is_offered(self):
        s = Server(8794, GO_BROCHURE_PDF="/nonexistent/brochure.pdf")
        try:
            self.assertFalse(json.loads(s.call("GET", "/api/status")[2])["brochureAvailable"])
            _, body = s.enquire()
            self.assertFalse(json.loads(s.call("GET", f"/api/enquiries/{body['reference']}")[2])["download"])
            self.assertEqual(s.call("GET", f"/api/brochure/{body['reference']}")[0], 404)
        finally:
            s.stop()


class AdminTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server(8795, GO_ADMIN_PASSWORD=PASSWORD, GO_BROCHURE_PDF=str(PDF))

    @classmethod
    def tearDownClass(cls):
        cls.s.stop()

    def test_requires_credentials(self):
        self.assertEqual(self.s.call("GET", "/admin")[0], 401)
        bad = {"Authorization": "Basic " + base64.b64encode(b"admin:wrong").decode()}
        self.assertEqual(self.s.call("GET", "/admin", headers=bad)[0], 401)
        self.assertEqual(self.s.call("GET", "/admin/export.csv")[0], 401)

    def test_lists_updates_and_exports(self):
        _, body = self.s.enquire(route="visit", name="=HYPERLINK(\"http://evil\")", **{"visit-type": "phone", "residence-interest": "residence-2"})
        ref = body["reference"]
        status, headers, page = self.s.call("GET", "/admin", headers=AUTH)
        self.assertEqual(status, 200)
        html = page.decode()
        self.assertIn(ref, html)
        self.assertNotIn("=HYPERLINK(\"http", html)           # escaped in the page
        self.assertIn("noindex", headers["X-Robots-Tag"])

        token = admin.csrf_token(PASSWORD)
        form = urllib.parse.urlencode({"csrf": token, "reference": ref, "status": "contacted", "note": "called, will visit Friday"})
        post = {**AUTH, "Content-Type": "application/x-www-form-urlencoded"}
        self.assertEqual(self.s.call("POST", "/admin/update", form, post)[0], 303)
        self.assertEqual(self.s.call("POST", "/admin/update", form.replace(token, "0" * 32), post)[0], 403)
        self.assertEqual(self.s.call("POST", "/admin/update", form, {"Content-Type": "application/x-www-form-urlencoded"})[0], 401)
        self.assertIn("called, will visit Friday", self.s.call("GET", "/admin?status=contacted", headers=AUTH)[2].decode())
        self.assertNotIn(ref, self.s.call("GET", "/admin?status=new", headers=AUTH)[2].decode())

        status, headers, csv_bytes = self.s.call("GET", "/admin/export.csv", headers=AUTH)
        self.assertEqual(status, 200)
        self.assertTrue(csv_bytes.startswith(b"\xef\xbb\xbf"))
        text = csv_bytes.decode("utf-8-sig")
        self.assertIn(ref, text)
        self.assertIn("'=HYPERLINK", text)                    # formula-injection guard
        self.assertIn("attachment", headers["Content-Disposition"])

    def test_cross_site_post_is_refused(self):
        form = urllib.parse.urlencode({"csrf": admin.csrf_token(PASSWORD), "reference": "A" * 12, "status": "closed", "note": ""})
        status, _, _ = self.s.call("POST", "/admin/update", form, {**AUTH, "Content-Type": "application/x-www-form-urlencoded", "Origin": "https://evil.example"})
        self.assertEqual(status, 403)

    def test_downloads_are_recorded(self):
        _, body = self.s.enquire()
        self.s.call("GET", f"/api/brochure/{body['reference']}")
        self.assertIn("دانلود شد", self.s.call("GET", "/admin", headers=AUTH)[2].decode())


class AdminOffTest(unittest.TestCase):
    def test_disabled_without_a_password(self):
        s = Server(8796)
        try:
            self.assertEqual(s.call("GET", "/admin", headers=AUTH)[0], 404)
        finally:
            s.stop()

    def test_behind_the_proxy_it_needs_https(self):
        s = Server(8797, GO_ADMIN_PASSWORD=PASSWORD, GO_TRUST_PROXY="1")
        try:
            self.assertEqual(s.call("GET", "/admin", headers=AUTH)[0], 404)
            self.assertEqual(s.call("GET", "/admin", headers={**AUTH, "X-Forwarded-Proto": "https"})[0], 200)
        finally:
            s.stop()

    def test_brute_force_is_throttled(self):
        s = Server(8798, GO_ADMIN_PASSWORD=PASSWORD)
        try:
            bad = {"Authorization": "Basic " + base64.b64encode(b"admin:no").decode()}
            codes = [s.call("GET", "/admin", headers=bad)[0] for _ in range(12)]
            self.assertEqual(codes[:10], [401] * 10)
            self.assertEqual(codes[10], 429)
            self.assertEqual(s.call("GET", "/admin", headers=AUTH)[0], 429)   # even the right password waits
        finally:
            s.stop()


class JalaliTest(unittest.TestCase):
    def test_known_dates(self):
        self.assertEqual(admin.to_jalali(2024, 3, 20), (1403, 1, 1))
        self.assertEqual(admin.to_jalali(2025, 3, 21), (1404, 1, 1))
        self.assertEqual(admin.to_jalali(2026, 3, 21), (1405, 1, 1))
        self.assertEqual(admin.to_jalali(2026, 10, 13), (1405, 7, 21))
        self.assertEqual(admin.to_jalali(2025, 3, 20), (1403, 12, 30))     # 1403 is a leap year

    def test_stamp_is_tehran_time_in_persian_digits(self):
        self.assertEqual(admin.tehran_stamp("2026-10-13T12:00:00+00:00"), "۱۴۰۵/۰۷/۲۱ ۱۵:۳۰")


if __name__ == "__main__":
    unittest.main()
