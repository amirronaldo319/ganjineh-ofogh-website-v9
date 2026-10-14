#!/usr/bin/env python3
"""Tightens `sizes` hints that claim a wider slot than the image is actually drawn at.

    node tools/audit_sizes.mjs http://127.0.0.1:8000 /tmp/sizes_audit.json     # measure (needs a running server)
    python3 tools/apply_sizes.py /tmp/sizes_audit.json                         # report
    python3 tools/apply_sizes.py /tmp/sizes_audit.json --write                 # write src/sizes.json (used by build_site.py)
    add --raise to also fix hints that claim LESS than the drawn width (sharper, a little heavier)

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
RAISE_BELOW = 1.25         # a hint is raised only where the picture is drawn more than this much wider than claimed
MIN_RULE_WIDTH = 1441      # viewports up to 1440 px keep the authored hint: the visual-regression suite covers them pixel for pixel


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


def _interp(pts, pick):
    """Piecewise lookup between measured samples; `pick` combines the two neighbours (max = safe for tightening,
    min = safe for raising, because a hint must never over-feed a narrower context)."""
    def at(w: int) -> float:
        for (w0, a0), (w1, a1) in zip(pts, pts[1:]):
            if w0 <= w <= w1:
                return pick(a0, a1)
        return pts[-1][1] if w > pts[-1][0] else pts[0][1]
    return at


def _rules(sizes, pts, target, eligible, flat_top, first, last):
    """Runs of consecutive eligible widths become one rule each. A run is expressed in vw when the needed claim grows with
    the viewport (within 10 %), otherwise in px; it is cut when neither fits."""
    runs, current = [], None
    for w in range(first, last + 1):
        if not eligible(w):
            current = None
            continue
        t = target(w)
        if current and current["hi"] == w - 1:
            px_hi, px_lo = max(current["pmax"], t), min(current["pmin"], t)
            vw_hi, vw_lo = max(current["vmax"], t / w), min(current["vmin"], t / w)
            if px_hi <= px_lo * 1.10 or vw_hi <= vw_lo * 1.10:
                current.update(hi=w, pmax=px_hi, pmin=px_lo, vmax=vw_hi, vmin=vw_lo)
                continue
        current = {"lo": w, "hi": w, "pmax": t, "pmin": t, "vmax": t / w, "vmin": t / w}
        runs.append(current)
    out = []
    for run in runs:
        if run["hi"] - run["lo"] < 7 and not (run["hi"] == last and flat_top):
            continue                                     # a sliver a few pixels wide is not worth a rule
        if run["pmax"] <= run["pmin"] * 1.10:
            value = f"{int(math.ceil(run['pmax'] / 4.0) * 4)}px"
        else:
            value = f"{math.ceil(run['vmax'] * 100 * 2) / 2:g}vw"
        if run["hi"] == last and flat_top and value.endswith("px"):
            cond = f"(min-width: {run['lo']}px)"
        elif run["lo"] == first and first >= 600:
            cond = f"(max-width: {run['hi']}px)"
        elif run["lo"] <= 320:
            cond = f"(max-width: {run['hi']}px)"
        else:
            cond = f"(min-width: {run['lo']}px) and (max-width: {run['hi']}px)"
        out.append((run["lo"], run["hi"], cond, value))
    return out


def propose(sizes: str, widths: list, drawn: list):
    """Rules for viewport ranges where the authored hint claims noticeably MORE than the largest drawn width."""
    pts = [(w, a) for w, a in zip(widths, drawn) if a]
    if len(pts) < 2:
        return None
    need = _interp(pts, max)
    first, last = pts[0][0], pts[-1][0]
    flat_top = pts[-1][1] <= pts[-2][1] * 1.02
    raw = _rules(sizes, pts,
                 target=lambda w: need(w) * MARGIN,
                 eligible=lambda w: w >= MIN_RULE_WIDTH and evaluate(sizes, w) >= need(w) * MARGIN * MIN_GAIN,
                 flat_top=flat_top, first=first, last=last)
    rules = []
    for lo, hi, cond, value in raw:
        claim = (lambda w, v=value: float(v[:-2]) * w / 100 if v.endswith("vw") else float(v[:-2]))
        if all(claim(w) <= evaluate(sizes, w) for w in range(lo, min(hi, last) + 1)):      # never asks for more than before
            rules.append((lo, cond, value))
    if not rules:
        return None
    parts = [f"{cond} {value}" for _, cond, value in sorted(rules, key=lambda r: -r[0])]
    return ", ".join(parts + [sizes if sizes else "100vw"])


def propose_raise(sizes: str, widths: list, drawn: list) -> list:
    """Rules for ranges where the authored hint claims much LESS than the picture is drawn at (the browser would pick a file
    one step too small and the picture is soft). They claim the drawn width of the narrowest context using that hint."""
    pts = [(w, a) for w, a in zip(widths, drawn) if a]
    if len(pts) < 2:
        return []
    got = _interp(pts, min)
    first, last = pts[0][0], pts[-1][0]
    flat_top = pts[-1][1] <= pts[-2][1] * 1.02
    raw = _rules(sizes, pts, target=lambda w: got(w),
                 eligible=lambda w: got(w) > evaluate(sizes, w) * RAISE_BELOW,
                 flat_top=flat_top, first=first, last=last)
    return [f"{cond} {value}" for _, _, cond, value in sorted(raw, key=lambda r: -r[0])]


def main() -> int:
    data = json.loads(Path(sys.argv[1]).read_text())
    write = "--write" in sys.argv
    widths = data["WIDTHS"]
    # one entry per (image, authored hint): the largest drawn width over every page and language that uses it
    groups = collections.defaultdict(lambda: [0] * len(widths))
    smallest = collections.defaultdict(lambda: [None] * len(widths))      # the narrowest context that uses the same hint
    for r in data["rows"]:
        key = (r["stem"], r["sizes"])
        for i, a in enumerate(r["widths"]):
            if a:
                groups[key][i] = max(groups[key][i], a)
                cur = smallest[key][i]
                smallest[key][i] = a if cur is None else min(cur, a)
    overrides = {}
    for (stem, old), drawn in sorted(groups.items()):
        d = [x or None for x in drawn]
        # Raising must not over-feed a context that draws the image smaller, so it follows the narrowest use of the hint.
        raised = propose_raise(old, widths, smallest[(stem, old)]) if "--raise" in sys.argv else []
        tightened = propose(old, widths, d)
        if raised or tightened:
            # raise rules cover ranges where the authored hint under-claims; tighten rules where it over-claims
            body = tightened if tightened else old
            overrides[f"{stem}|{old}"] = ", ".join(raised + [body])
    for key, new in overrides.items():
        print(f"{key.split('|')[0]:16} {key.split('|')[1]}\n{'':16} -> {new}")
    print(f"\n{len(overrides)} hints tightened of {len(groups)} (image, hint) pairs")
    if write:
        (ROOT / "src" / "sizes.json").write_text(json.dumps(overrides, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print("wrote src/sizes.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
