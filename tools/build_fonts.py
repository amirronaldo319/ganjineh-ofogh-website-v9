#!/usr/bin/env python3
"""Trims the three Latin web fonts to the characters the site actually uses (about a third smaller).

    pip install fonttools brotli
    python3 tools/build_fonts.py            # rewrites assets/fonts/{SourceSerif4-normal,SourceSerif4-italic,Inter-normal}-latin.woff2
    python3 tools/build_fonts.py --check    # exits 1 if a used character is missing from a trimmed font

Also writes two Vazirmatn subsets next to the untouched full file (it stays as the fallback face):
  Vazirmatn-fa-used.woff2   every Arabic-script character used anywhere on the site (Persian pages)
  Vazirmatn-en-used.woff2   only what the English pages use (the "فا" language button, a few place names)
and the @font-face rules for them (unicode-range limited to exactly the characters each file holds, so anything else
still resolves to the full file). Persian pages get theirs from fonts.css; English pages from fonts-en.css, which
build_site.py inlines after the main stylesheet so it takes precedence.

Originals live in tools/font-sources/ and are never published. Run it again after adding copy with new characters;
a missing character only falls back to a system font for that one glyph, so nothing breaks, but --check tells you.
"""
import glob
import re
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


ARABIC = re.compile(r"[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u200C\u200D]")
FA_SOURCES = ["*.html", "residences-3d/*.html", "residences-3d/*.js", "tower-viewer/index.html", "assets/js/*.js", "src/*.json", "src/site.config.json"]
EN_SOURCES = ["en/*.html"]
VAZIR = "Vazirmatn-normal-arabic"
VAZIR_FACES = {"fa": ("Vazirmatn-fa-used", FA_SOURCES + EN_SOURCES), "en": ("Vazirmatn-en-used", EN_SOURCES)}
FACE_CSS = "@font-face{{font-family:'Vazirmatn';font-style:normal;font-weight:300 800;font-display:swap;src:url({file}.woff2) format('woff2');unicode-range:{ranges};}}"


def arabic_characters(patterns) -> set[int]:
    found: set[int] = set()
    for pattern in patterns:
        for path in glob.glob(str(ROOT / pattern)):
            if path.endswith(".min.js"):
                continue
            found |= {ord(c) for c in ARABIC.findall(Path(path).read_text(encoding="utf-8", errors="ignore"))}
    return found


def to_ranges(codepoints) -> str:
    out, run = [], []
    for c in sorted(set(codepoints)):
        if run and c == run[-1] + 1:
            run.append(c)
            continue
        if run:
            out.append(run)
        run = [c]
    if run:
        out.append(run)
    return ", ".join(f"U+{r[0]:04X}" if len(r) == 1 else f"U+{r[0]:04X}-{r[-1]:04X}" for r in out)


def build_vazirmatn(check: bool) -> int:
    original = SRC / f"{VAZIR}.woff2"
    cmap = set(TTFont(original).getBestCmap())
    problems = 0
    css = {}
    for key, (name, patterns) in VAZIR_FACES.items():
        wanted = (arabic_characters(patterns) & cmap) | {0x200C}
        target = OUT / f"{name}.woff2"
        if not check:
            options = subset.Options()
            options.flavor = "woff2"
            options.layout_features = ["*"]      # keep joining forms and mark positioning
            options.hinting = False
            options.name_IDs = ["*"]
            options.notdef_outline = True
            subsetter = subset.Subsetter(options)
            subsetter.populate(unicodes=sorted(wanted | {0x20}))
            font = TTFont(original)
            subsetter.subset(font)
            font.flavor = "woff2"
            font.save(target)
            print(f"{name}: {original.stat().st_size // 1024} KB -> {target.stat().st_size // 1024} KB ({len(wanted)} characters)")
        else:
            have = set(TTFont(target).getBestCmap())
            gone = sorted(c for c in wanted if c not in have)
            if gone:
                problems += len(gone)
                print(f"{name}: missing {len(gone)} used character(s): {''.join(map(chr, gone))}")
        css[key] = FACE_CSS.format(file=name, ranges=to_ranges(sorted(wanted - {0x20})))
    if not check:
        fonts_css = OUT / "fonts.css"
        text = fonts_css.read_text(encoding="utf-8")
        text = re.sub(r"/\* vazirmatn-used:start \*/.*?/\* vazirmatn-used:end \*/\n?", "", text, flags=re.S)
        text = text.rstrip("\n") + "\n/* vazirmatn-used:start */\n" + css["fa"] + "\n/* vazirmatn-used:end */\n"
        fonts_css.write_text(text, encoding="utf-8")
        (OUT / "fonts-en.css").write_text(css["en"] + "\n", encoding="utf-8")
    return problems


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
    missing_total += build_vazirmatn(check)
    if check:
        print("fonts cover every used character" if not missing_total else f"{missing_total} missing")
    return 1 if missing_total else 0


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv))
