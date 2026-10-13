#!/usr/bin/env python3
"""Exports every Persian sentence of the site, next to its English twin, for a native-Persian editor.

    python3 tools/export_copy.py        # writes launch/PERSIAN-COPY.md

Each row is `Persian | English`. The editor changes the Persian column; the source of each row is the page named in its
heading (src/pages/<page>.html, src/partials/*.html, src/timeline.json). Rows are de-duplicated across the site.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAIR = re.compile(r'<(?P<tag>[a-zA-Z][\w-]*)(?P<a>[^<>]*?)\sen="(?P<en>[^"]*)"(?P<b>[^<>]*)>(?P<fa>[^<>]*[؀-ۿ][^<>]*)</(?P=tag)>')
ATTR = re.compile(r'\b(?:alt|aria-label|title|content)="([^"]*[؀-ۿ][^"]*)"[^<>]*?\ben-(?:alt|aria-label|title|content)="([^"]*)"')


def clean(text):
    return " ".join(re.sub(r"\{\{[^}]*\}\}", "", text).split())


def rows_for(text):
    out = [(clean(m["fa"]), clean(m["en"])) for m in PAIR.finditer(text)]
    out += [(clean(a), clean(b)) for a, b in ATTR.findall(text)]
    return [(fa, en) for fa, en in out if fa]


def main():
    seen = set()
    sections = []
    sources = [(f"Page: {p.stem}", p) for p in sorted((ROOT / "src" / "pages").glob("*.html"))] + \
              [(f"Shared: {p.stem}", p) for p in sorted((ROOT / "src" / "partials").glob("*.html"))]
    for title, path in sources:
        rows = []
        for fa, en in rows_for(path.read_text(encoding="utf-8")):
            if (fa, en) not in seen:
                seen.add((fa, en))
                rows.append((fa, en))
        if rows:
            sections.append((title, rows))
    timeline = json.loads((ROOT / "src" / "timeline.json").read_text(encoding="utf-8"))
    trows = []
    for item in timeline if isinstance(timeline, list) else []:
        for fa, en in zip(item.get("fa", []), item.get("en", [])):
            if fa and (fa, en) not in seen:
                seen.add((fa, en))
                trows.append((clean(fa), clean(en)))
    if trows:
        sections.append(("Group history (timeline.json)", trows))

    out = ["# Persian copy for the editor", "",
           "Every Persian sentence on the site with its English twin. Change the Persian column; mark changes in the margin or return a copy of this file.",
           "Check tone, grammar, half-spaces (می‌شود, خانه‌ی), numerals (۰-۹) and consistency of terms (واحد, طبقه‌ی تیپ, مساحت). "
           "Figures marked «ارائه‌شده» are supplied figures awaiting approval: do not remove that wording.", "",
           f"{sum(len(r) for _, r in sections)} unique rows.", ""]
    for title, rows in sections:
        out += [f"## {title}", "", "| Persian | English |", "|---|---|"]
        out += [f"| {fa.replace('|', '\\|')} | {en.replace('|', '\\|')} |" for fa, en in rows]
        out.append("")
    (ROOT / "launch").mkdir(exist_ok=True)
    (ROOT / "launch" / "PERSIAN-COPY.md").write_text("\n".join(out), encoding="utf-8")
    print(f"launch/PERSIAN-COPY.md: {sum(len(r) for _, r in sections)} rows in {len(sections)} sections")


if __name__ == "__main__":
    main()
