#!/usr/bin/env python3
"""Tightens `sizes` hints that claim a wider slot than the image is actually drawn at.

    node tools/audit_sizes.mjs http://127.0.0.1:8000 /tmp/sizes_audit.json     # measure (needs a running server)
    python3 tools/apply_sizes.py /tmp/sizes_audit.json                         # report
    python3 tools/apply_sizes.py /tmp/sizes_audit.json --write                 # write src/sizes.json (used by build_site.py)

A viewport-relative hint such as `31vw` keeps growing on a 2560 px monitor while the layout stops at its container's
max-width, so the browser picks a bigger file than it can show. The new hint is, per viewport interval, the SMALLER of
the old claim and the measured drawn width (+4 %). It can therefore never ask for a larger file than before, and the
picture is drawn at exactly the same CSS size; only the candidate chosen can drop one step where the old hint overshot.
"""
import collections
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARGIN = 1.04
MIN_GAIN = 1.15            # leave a hint alone unless it overshoots by more than this somewhere


def evaluate(sizes: str, w: float) -> float:
    if not sizes:
        return w
    for part in (p.strip() for p in sizes.split(",")):
        m = re.match(r"^\((max|min)-width:\s*(\d+)px\)\s+(.+)$", part)
        if m:
            kind, val, length = m.group(1), int(m.group(2)), m.group(3)
            if (kind == "max" and w <= val) or (kind == "min" and w >= val):
                return length_px(length, w)
        else:
            return length_px(part, w)
    return w


def length_px(s: str, w: float) -> float:
    s = s.strip()
    m = re.match(r"^([\d.]+)vw$", s)
    if m:
        return float(m.group(1)) * w / 100
    m = re.match(r"^([\d.]+)px$", s)
    if m:
        return float(m.group(1))
    raise ValueError(f"unsupported sizes length: {s}")


def tail_expression(sizes: str) -> str:
    """The unconditional last entry of the old hint (what applies above the widest breakpoint)."""
    parts = [p.strip() for p in sizes.split(",")] if sizes else ["100vw"]
    return parts[-1]


def propose(sizes: str, widths: list, drawn: list) -> str | None:
    """drawn[i] is the largest width the image has at widths[i] (None where hidden).

    The old hint stays as it is; rules are put in front of it for the viewport ranges where it claims noticeably more
    than the image is drawn at. A rule is never larger than the old claim at any width it covers."""
    pts = [(w, a) for w, a in zip(widths, drawn) if a]
    if len(pts) < 2:
        return None

    def need(w: int) -> float:
        """Largest width drawn at viewport w, taking the larger of the two samples around it (conservative)."""
        for (w0, a0), (w1, a1) in zip(pts, pts[1:]):
            if w0 <= w <= w1:
                return max(a0, a1) * MARGIN
        return pts[-1][1] * MARGIN if w > pts[-1][0] else pts[0][1] * MARGIN

    first, last = pts[0][0], pts[-1][0]
    pieces, current = [], None
    for w in range(first, last + 1):
        n, o = need(w), evaluate(sizes, w)
        if o < n * MIN_GAIN:
            current = None
            continue
        if current and current["hi"] == w - 1 and max(current["need"], n) <= min(current["nmin"], n) * 1.10:
            current.update(hi=w, need=max(current["need"], n), nmin=min(current["nmin"], n), old=min(current["old"], o))
        else:
            current = {"lo": w, "hi": w, "need": n, "nmin": n, "old": o}
            pieces.append(current)
    flat_top = pts[-1][1] <= pts[-2][1] * 1.02
    parts = []
    for piece in sorted(pieces, key=lambda r: -r["lo"]):
        value = int(math.ceil(piece["need"] / 4.0) * 4)
        if value > piece["old"]:
            continue
        if piece["hi"] == last and flat_top:
            parts.append(f"(min-width: {piece['lo']}px) {value}px")
        elif piece["lo"] == first:
            parts.append(f"(max-width: {piece['hi']}px) {value}px")
        else:
            parts.append(f"(min-width: {piece['lo']}px) and (max-width: {piece['hi']}px) {value}px")
    if not parts:
        return None
    new = ", ".join(parts + [sizes if sizes else "100vw"])
    return new if new != sizes else None


def main() -> int:
    data = json.loads(Path(sys.argv[1]).read_text())
    write = "--write" in sys.argv
    widths = data["WIDTHS"]
    # one entry per (image, authored hint): the largest drawn width over every page and language that uses it
    groups = collections.defaultdict(lambda: [0] * len(widths))
    for r in data["rows"]:
        key = (r["stem"], r["sizes"])
        for i, a in enumerate(r["widths"]):
            if a:
                groups[key][i] = max(groups[key][i], a)
    overrides = {}
    for (stem, old), drawn in sorted(groups.items()):
        new = propose(old, widths, [d or None for d in drawn])
        if new:
            overrides[f"{stem}|{old}"] = new
    for key, new in overrides.items():
        print(f"{key.split('|')[0]:16} {key.split('|')[1]}\n{'':16} -> {new}")
    print(f"\n{len(overrides)} hints tightened of {len(groups)} (image, hint) pairs")
    if write:
        (ROOT / "src" / "sizes.json").write_text(json.dumps(overrides, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print("wrote src/sizes.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
