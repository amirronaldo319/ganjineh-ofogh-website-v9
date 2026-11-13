"""The committed, built site matches its source, and no built file was changed by hand.

    python3 -m unittest tests/test_build_fresh.py

tools/build_site.py writes two fingerprints into sw.js: one of the source files, one of every published file. Editing
a source file without rebuilding, or editing a built file directly (which leaves returning visitors on the old cached
copy, because its ?v= tag and the service-worker version do not change), makes one of these fail.
The fix is always the same: python3 tools/build_site.py, then commit.
"""
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build_site  # noqa: E402 - importing reads the source data only; nothing is built

SW = (ROOT / "sw.js").read_text(encoding="utf-8")
REBUILD = "run: python3 tools/build_site.py"


class BuildFreshTest(unittest.TestCase):
    def test_pages_were_built_from_the_current_source(self):
        stamped = re.search(r"built from source ([0-9a-f]{12})", SW)
        self.assertTrue(stamped, "sw.js carries no source fingerprint; " + REBUILD)
        self.assertEqual(stamped.group(1), build_site.digest_of(build_site.source_files()), "a source file changed after the last build; " + REBUILD)

    def test_no_built_file_changed_after_the_build(self):
        version = re.search(r"const VERSION = '([0-9a-f]{12})'", SW).group(1)
        self.assertEqual(version, build_site.digest_of(build_site.published_files()),
                         "a published file differs from what the last build wrote (edited by hand, or not committed); " + REBUILD)


if __name__ == "__main__":
    unittest.main()
