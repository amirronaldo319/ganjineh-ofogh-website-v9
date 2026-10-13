#!/usr/bin/env python3
"""Persian typography and wording lint for the page sources (src/**) and scripts (assets/js/*.js, excluding *.min.js).

    python3 tools/lint_persian.py          # prints findings; exit 1 if any

Checks the mistakes that make Persian copy look unedited: Arabic letter forms (ي ك), missing half-spaces (می‌شود, خانه‌ی),
spaces around punctuation, Latin digits inside Persian sentences, straight quotes, doubled spaces and Arabic punctuation.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [*ROOT.glob("src/**/*.html"), *ROOT.glob("src/*.json"), *[p for p in ROOT.glob("assets/js/*.js") if not p.name.endswith(".min.js")], ROOT / "tools" / "build_site.py"]
PERSIAN = re.compile(r"[؀-ۿ]")
CHECKS = [
    ("Arabic ي/ك instead of Persian ی/ک", re.compile(r"[يك]")),
    ("می/نمی followed by a space (use a half-space: می‌شود)", re.compile(r"(?<![؀-ۿ])(ن?می) (?=[؀-ۿ])")),
    ("detached plural/suffix (use a half-space: برج‌ها)", re.compile(r"(?<=[؀-ۿ]) (ها|های|هایی|تر|ترین|ام|ات|اش)(?![؀-ۿ])")),
    ("space before ، ؛ ؟ : . ! ٪", re.compile(r"(?<=[؀-ۿ]) [،؛؟:!٪](?!\w)")),
    ("no space after ، or ؛", re.compile(r"[،؛](?=[\u0600-\u06FFA-Za-z0-9])")),
    ("Latin comma/semicolon/question mark in Persian text", re.compile(r"(?<=[؀-ۿ])[,;?](?= |$)")),
    ("doubled space inside Persian text", re.compile(r"(?<=[؀-ۿ])  +(?=[؀-ۿ])")),
    ("ی-ezafe written as ی after ه without half-space (خانه ی)", re.compile(r"(?<=ه) ی(?![؀-ۿ])")),
    ("Latin digits next to Persian letters (use ۰-۹)", re.compile(r"(?<![A-Za-z0-9./:#=+-])[0-9]+(?= ?[\u0600-\u06FF])|(?<=[\u0600-\u06FF] )[0-9]+(?![A-Za-z0-9./:#])")),
    ("straight quotes around Persian text (use « »)", re.compile(r"\"[؀-ۿ][^\"<>]*[؀-ۿ]\"(?!\s*[a-z-]+=)")),
    ("percent sign glued to a Latin digit", re.compile(r"[0-9]٪|٪[0-9]")),
]
# Lines that are markup/code and legitimately contain such patterns are skipped by only inspecting text between > and <, or string literals.
TEXT = re.compile(r">([^<>{}]*[؀-ۿ][^<>{}]*)<|\"([^\"\n]*[؀-ۿ][^\"\n]*)\"|'([^'\n]*[؀-ۿ][^'\n]*)'")


def main() -> int:
    found = 0
    for path in sorted(set(FILES)):
        if not path.exists():
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for match in TEXT.finditer(line):
                text = next(g for g in match.groups() if g)
                for label, rx in CHECKS:
                    if label.startswith("straight quotes") and match.group(0).startswith('"'):
                        continue
                    hit = rx.search(text)
                    if hit:
                        found += 1
                        print(f"{path.relative_to(ROOT)}:{number}: {label}: …{text[max(0, hit.start() - 18):hit.end() + 18]}…")
    print(f"{found} finding(s)")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
