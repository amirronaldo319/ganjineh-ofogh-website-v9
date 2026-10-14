#!/usr/bin/env python3
"""Adds intermediate srcset widths where the existing ladder jumps by more than 1.6x.

    .venv/bin/python tools/add_image_rungs.py            # write the new files + update assets/img/images.json
    .venv/bin/python tools/add_image_rungs.py --dry-run  # list what would be added

Why: with a gap such as 1000 → 2000 px a phone that needs 1080 px is served the 2000 px file (about 1.85x the pixels
it can show). A rung in between lets the browser pick a closer file. Existing files are never rewritten; only widths
that do not exist yet are generated, from the same source artwork, with the same encoder settings as build_images.py.
Layout, `sizes`, display size and the existing files are untouched.
"""
import argparse
import io
import json
import math
import sys
from pathlib import Path

import pymupdf
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_images as bi  # noqa: E402

MAX_STEP = 1.6      # largest allowed ratio between neighbouring widths
ALIGN = 8           # widths are rounded to a multiple of this


def plan(widths: list[int], source_w: int) -> list[int]:
    """New widths needed so that no neighbouring pair is more than MAX_STEP apart."""
    have = sorted(set(widths))
    out: list[int] = []
    for a, b in zip(have, have[1:]):
        parts = math.ceil(math.log(b / a) / math.log(MAX_STEP))
        if parts <= 1:
            continue
        step = (b / a) ** (1 / parts)
        for i in range(1, parts):
            w = int(round(a * step ** i / ALIGN) * ALIGN)
            if a < w < b and w <= source_w:
                out.append(w)
    return sorted(set(out))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    meta_path = bi.OUT / "images.json"
    meta = json.loads(meta_path.read_text())
    docs = None if args.dry_run else {k: pymupdf.open(str(v)) for k, v in bi.SRC.items()}
    added_kb = 0
    for name, info in meta.items():
        current = [f["w"] for f in info["files"]]
        new = plan(current, info["w"])
        if not new:
            continue
        print(f"{name:16s} {sorted(current)} + {new}")
        if args.dry_run:
            continue
        src, page, idx, _ = bi.JOBS[name]
        xref = docs[src][page - 1].get_images(full=True)[idx][0]
        im = Image.open(io.BytesIO(docs[src].extract_image(xref)["image"])).convert("RGB")
        w0, h0 = im.size
        assert (w0, h0) == (info["w"], info["h"]), f"{name}: source size changed"
        for w in new:
            h = round(h0 * w / w0)
            out = im.resize((w, h), Image.LANCZOS)
            fn, av = f"{name}-{w}.webp", f"{name}-{w}.avif"
            if (bi.OUT / fn).exists() or (bi.OUT / av).exists():
                continue
            out.save(bi.OUT / fn, "WEBP", quality=bi.quality(name), method=6)
            out.save(bi.OUT / av, "AVIF", quality=bi.avif_quality(name), speed=6)
            entry = {"file": fn, "avif": av, "w": w, "h": h,
                     "kb": round((bi.OUT / fn).stat().st_size / 1024), "avif_kb": round((bi.OUT / av).stat().st_size / 1024)}
            info["files"].append(entry)
            added_kb += entry["kb"] + entry["avif_kb"]
        info["files"].sort(key=lambda f: -f["w"])
    if not args.dry_run:
        meta_path.write_text(json.dumps(meta, indent=1))
        print(f"\nadded {added_kb / 1024:.1f} MB of new files (never served unless a viewport needs that width)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
