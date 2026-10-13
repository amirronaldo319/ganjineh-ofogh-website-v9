#!/usr/bin/env python3
"""Adds a tiny blurred placeholder (a ~250-byte WebP data URI) to every image in assets/img/images.json.

    python3 tools/build_lqip.py          # needs Pillow; reads the existing smallest files, no PDFs needed

The page builder puts it behind each <img> so a slow connection shows the picture's colours and shapes at once and the
sharp image fades in over it, instead of a flat box. Re-run after tools/build_images.py.
"""
import base64
import io
import json
from pathlib import Path

from PIL import Image, ImageFilter

IMG = Path(__file__).resolve().parent.parent / "assets" / "img"
WIDTH = 20


def main():
    meta = json.loads((IMG / "images.json").read_text())
    total = 0
    for name, info in meta.items():
        smallest = min(info["files"], key=lambda f: f["w"])
        im = Image.open(IMG / smallest["file"]).convert("RGB")
        h = max(1, round(WIDTH * im.height / im.width))
        tiny = im.resize((WIDTH, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
        buf = io.BytesIO()
        tiny.save(buf, "WEBP", quality=32, method=6)
        info["lqip"] = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
        total += len(info["lqip"])
    (IMG / "images.json").write_text(json.dumps(meta, indent=1))
    print(f"{len(meta)} placeholders, {total / len(meta):.0f} characters each on average")


if __name__ == "__main__":
    main()
