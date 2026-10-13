#!/usr/bin/env python3
"""Trims the three Latin web fonts to the characters the site actually uses (about a third smaller).

    pip install fonttools brotli
    python3 tools/build_fonts.py            # rewrites assets/fonts/{SourceSerif4-normal,SourceSerif4-italic,Inter-normal}-latin.woff2
    python3 tools/build_fonts.py --check    # exits 1 if a used character is missing from a trimmed font

Originals live in tools/font-sources/ and are never published. Run it again after adding copy with new characters;
a missing character only falls back to a system font for that one glyph, so nothing breaks, but --check tells you.
"""
import glob
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "font-sources"
OUT = ROOT / "assets" / "fonts"
NAMES = ["SourceSerif4-normal-latin", "SourceSerif4-italic-latin", "Inter-normal-latin"]
ALWAYS = set(range(0x20, 0x7F)) | {0xA0, 0xA9, 0xB7, 0xD7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2190, 0x2192, 0xB2, 0xB3}


def used_characters() -> set[int]:
    chars: set[int] = set()
    patterns = ["*.html", "en/*.html", "residences-3d/*.html", "residences-3d/*.js", "tower-viewer/index.html", "assets/js/*.js", "src/*.json", "src/site.config.json"]
    for pattern in patterns:
        for path in glob.glob(str(ROOT / pattern)):
            if path.endswith(".min.js"):
                continue
            chars |= set(map(ord, Path(path).read_text(encoding="utf-8", errors="ignore")))
    return chars


def main(check: bool) -> int:
    used = used_characters()
    missing_total = 0
    for name in NAMES:
        original = SRC / f"{name}.woff2"
        cmap = set(TTFont(original).getBestCmap())
        wanted = (used | ALWAYS) & cmap
        if check:
            have = set(TTFont(OUT / f"{name}.woff2").getBestCmap())
            gone = sorted(c for c in (used & cmap) if c not in have and c > 0x20)
            if gone:
                missing_total += len(gone)
                print(f"{name}: missing {len(gone)} used character(s): {''.join(map(chr, gone))}")
            continue
        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["*"]
        options.hinting = False
        options.name_IDs = ["*"]
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=sorted(wanted))
        font = TTFont(original)
        subsetter.subset(font)
        font.flavor = "woff2"
        font.save(OUT / f"{name}.woff2")
        print(f"{name}: {original.stat().st_size // 1024} KB -> {(OUT / f'{name}.woff2').stat().st_size // 1024} KB ({len(wanted)} glyphs)")
    if check:
        print("fonts cover every used character" if not missing_total else f"{missing_total} missing")
    return 1 if missing_total else 0


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv))
