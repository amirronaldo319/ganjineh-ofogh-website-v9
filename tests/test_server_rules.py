"""Small rules inside server.py, checked directly: the mobile-number rule and the rate-limit tables.

    python3 -m unittest tests/test_server_rules.py
"""
import json
import sys
import time
import unittest
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import server  # noqa: E402 - importing defines functions only; the server starts under __main__

CASES = json.loads((ROOT / "tests" / "fixtures" / "mobiles.json").read_text(encoding="utf-8"))["cases"]


class MobileTest(unittest.TestCase):
    def test_shared_cases(self):
        # tests/mobile.test.mjs runs the same cases against the Cloudflare backend and the two browser forms
        for typed, stored in CASES:
            with self.subTest(typed=typed):
                self.assertEqual(server.normalize_mobile(typed), stored)


class LimitTest(unittest.TestCase):
    def setUp(self):
        for store in (server.LIMIT, server.LOOKUP_LIMIT, server.ADMIN_FAILS):
            store.clear()
        server._SWEPT[0] = 0.0   # a sweep is due

    def test_allows_up_to_the_limit_then_refuses(self):
        self.assertEqual([server.allow(server.LIMIT, "a", 3) for _ in range(5)], [True, True, True, False, False])

    def test_a_check_without_record_counts_nothing(self):
        self.assertTrue(all(server.allow(server.LIMIT, "a", 1, record=False) for _ in range(5)))
        self.assertFalse(server.LIMIT.get("a"))

    def test_a_use_can_be_taken_back(self):
        self.assertTrue(server.allow(server.LIMIT, "a", 1))
        self.assertFalse(server.allow(server.LIMIT, "a", 1))
        server.take_back(server.LIMIT, "a")
        self.assertTrue(server.allow(server.LIMIT, "a", 1))
        server.take_back(server.LIMIT, "never seen")   # nothing to take back is not an error

    def test_old_uses_expire(self):
        server.LIMIT["a"] = deque([time.monotonic() - 7200] * 3)
        self.assertTrue(server.allow(server.LIMIT, "a", 3))
        self.assertEqual(len(server.LIMIT["a"]), 1)

    def test_addresses_with_nothing_recent_are_forgotten(self):
        long_ago = time.monotonic() - 7200
        server.LIMIT["gone"] = deque([long_ago])
        server.LOOKUP_LIMIT["gone"] = deque()
        server.ADMIN_FAILS["gone"] = deque([long_ago, long_ago])
        server.ADMIN_FAILS["recent"] = deque([time.monotonic()])
        self.assertTrue(server.allow(server.LIMIT, "now", 10))
        self.assertEqual((list(server.LIMIT), list(server.LOOKUP_LIMIT), list(server.ADMIN_FAILS)), (["now"], [], ["recent"]))
        self.assertEqual(len(server.LIMIT["now"]), 1)   # the address being counted keeps its record

    def test_sweeps_are_spaced_out(self):
        server.allow(server.LIMIT, "now", 10)          # sweeps, and sets the clock
        server.LIMIT["gone"] = deque([time.monotonic() - 7200])
        server.allow(server.LIMIT, "now", 10)          # too soon to sweep again
        self.assertIn("gone", server.LIMIT)

    def test_parallel_uses_never_exceed_the_limit(self):
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(32) as pool:
            results = list(pool.map(lambda _: server.allow(server.LIMIT, "burst", 10), range(400)))
        self.assertEqual(results.count(True), 10)

if __name__ == "__main__":
    unittest.main()
