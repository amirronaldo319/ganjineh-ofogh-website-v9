"""Enquiry notification: a webhook receives each new enquiry; a dead webhook never breaks the visitor's request.

    python3 -m unittest tests/test_notify.py
"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8791


class Hook(BaseHTTPRequestHandler):
    received = []

    def do_POST(self):
        Hook.received.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
        self.send_response(200)
        self.end_headers()

    def log_message(self, *a):
        pass


def start_server(webhook):
    env = dict(os.environ, PORT=str(PORT), GO_ACCEPT_ENQUIRIES="1", GO_NOTIFY_WEBHOOK=webhook,
               GO_DB_PATH=str(Path(tempfile.mkdtemp()) / "e.sqlite3"))
    p = subprocess.Popen([sys.executable, "server.py"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    for _ in range(50):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/status", timeout=1).read()
            return p
        except OSError:
            time.sleep(0.1)
    p.kill()
    raise RuntimeError("server did not start")


def post():
    body = json.dumps({"route": "visit", "name": "Notify Test", "mobile": "09120000000", "consent": "yes",
                       "residence-interest": "residence-2", "visit-type": "phone"}).encode()
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}/api/enquiries", data=body, headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=5)


class NotifyTest(unittest.TestCase):
    def test_webhook_receives_enquiry(self):
        hook = HTTPServer(("127.0.0.1", 8792), Hook)
        threading.Thread(target=hook.serve_forever, daemon=True).start()
        server = start_server("http://127.0.0.1:8792/hook")
        try:
            r = post()
            ref = json.loads(r.read())["reference"]
            for _ in range(50):
                if Hook.received:
                    break
                time.sleep(0.1)
            self.assertEqual(r.status, 201)
            self.assertEqual(len(Hook.received), 1)
            got = Hook.received[0]
            self.assertEqual(got["reference"], ref)
            self.assertEqual(got["residence"], "residence-2")
            self.assertEqual(got["name"], "Notify Test")
        finally:
            server.kill()
            hook.shutdown()

    def test_dead_webhook_does_not_break_the_request(self):
        server = start_server("http://127.0.0.1:1/never")
        try:
            self.assertEqual(post().status, 201)
        finally:
            server.kill()


if __name__ == "__main__":
    unittest.main()
