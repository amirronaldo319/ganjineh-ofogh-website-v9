"""Every surface shows the apartment areas in src/apartments.json, and no other apartment-sized figure.

    python3 -m unittest tests/test_areas.py

If the project team corrects an area, change it in src/apartments.json, rebuild, and this test tells you if any surface was missed.
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "src" / "apartments.json").read_text(encoding="utf-8"))
AREAS = {float(v) for v in DATA["areas"].values()}
SITE = {float(v) for v in DATA["site"].values()}
FA = str.maketrans("۰۱۲۳۴۵۶۷۸۹٫٬،", "0123456789.,,")
UNIT = r"(?:m²|m2|م²|متر\s*مربع|متری)"
FIGURE = re.compile(r"(?<![\d.])(\d{2,5}(?:\.\d{1,2})?)\s*(?:<[^>]*>)*\s*" + UNIT)
# Other square-metre figures that are real and unrelated to the apartments (e.g. the group's history).
OTHER = {12000.0}


def figures(text):
    text = text.translate(FA)
    text = re.sub(r"(?<=\d),(?=\d{3})", "", text)
    return {float(m.group(1)) for m in FIGURE.finditer(text)}


class AreaConsistency(unittest.TestCase):
    def test_every_page_uses_only_known_figures(self):
        stray = {}
        files = [*ROOT.glob("*.html"), *ROOT.glob("en/*.html"), ROOT / "residences-3d" / "app.js", ROOT / "launch" / "CAPTIONS.md"]
        for f in files:
            if not f.exists():
                continue
            extra = figures(f.read_text(encoding="utf-8")) - AREAS - SITE - OTHER
            if extra:
                stray[str(f.relative_to(ROOT))] = sorted(extra)
        self.assertEqual(stray, {}, "figures that are not in src/apartments.json")

    def test_all_four_areas_appear_on_the_key_surfaces(self):
        for page in ("residences.html", "en/residences.html", "contact.html", "en/brochure.html", "faq.html", "compare.html"):
            text = (ROOT / page).read_text(encoding="utf-8").translate(FA)
            missing = [v for v in DATA["areas"].values() if not re.search(r"(?<![\d.])" + re.escape(v) + r"(?![\d])", text)]
            self.assertEqual(missing, [], f"{page} does not show {missing}")

    def test_the_3d_viewer_labels_follow_the_source(self):
        app = (ROOT / "residences-3d" / "app.js").read_text(encoding="utf-8")
        listed = re.search(r"const AREAS=\[([^\]]*)\];", app).group(1)
        self.assertEqual([float(x.strip("' ")) for x in listed.split(",")], [float(DATA["areas"][k]) for k in "1234"])


if __name__ == "__main__":
    unittest.main()
