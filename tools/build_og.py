#!/usr/bin/env python3
"""Render the 1200x630 share image (assets/img/og.jpg) used for Telegram / WhatsApp / Instagram previews.

    pip install playwright pillow     # uses an installed Google Chrome, no browser download
    python3 tools/build_og.py
"""
import io
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HTML = f"""<!doctype html><meta charset="utf-8"><style>
@font-face {{ font-family: V; src: url(file://{ROOT}/assets/fonts/Vazirmatn-normal-arabic.woff2); font-weight: 100 900; }}
@font-face {{ font-family: S; src: url(file://{ROOT}/assets/fonts/SourceSerif4-normal-latin.woff2); font-weight: 200 900; }}
@font-face {{ font-family: I; src: url(file://{ROOT}/assets/fonts/Inter-normal-latin.woff2); font-weight: 100 900; }}
* {{ box-sizing: border-box; margin: 0 }}
body {{ width: 1200px; height: 630px; background: #0f1a16; color: #ede8dc; display: grid; grid-template-columns: 1fr 470px; overflow: hidden; position: relative }}
body::before {{ content: ""; position: absolute; inset: 0; background: radial-gradient(60% 90% at 88% 20%, rgba(201,178,122,.28), transparent 70%), radial-gradient(50% 70% at 0 100%, rgba(47,86,70,.55), transparent 70%) }}
.copy {{ position: relative; padding: 70px 64px; display: flex; flex-direction: column; justify-content: center; direction: rtl; text-align: right }}
.rule {{ width: 54px; height: 2px; background: #c9b27a; margin-bottom: 26px }}
.fa {{ font: 800 92px/1.15 V; }}
.en {{ font: 300 50px/1.2 S; color: #d6c18f; margin-top: 6px; direction: ltr; text-align: right; letter-spacing: .01em }}
.tag {{ font: 400 29px/1.5 V; color: #cfc9bb; margin-top: 30px }}
.tag i {{ font: italic 300 24px S; display: block; color: #a9b0a8; direction: ltr; text-align: right; margin-top: 4px }}
.loc {{ font: 500 19px I; letter-spacing: .26em; color: #c9b27a; margin-top: 30px; direction: ltr; text-align: right }}
.art {{ position: relative; margin: 36px 56px 0 0; }}
.arch {{ position: absolute; inset: 0; border-radius: 999px 999px 0 0; overflow: hidden; box-shadow: 0 30px 70px rgba(0,0,0,.55) }}
.arch img {{ width: 100%; height: 100%; object-fit: cover; object-position: 50% 38%; transform: scale(1.12) }}
</style>
<body><div class="copy"><div class="rule"></div><div class="fa">برج گنجینه افق</div><div class="en">Ganjineh Ofogh</div>
<div class="tag">نور روز و زندگی روشن‌تر<i>Daylight and a brighter life.</i></div><div class="loc">TEHRAN / OZGOL</div></div>
<div class="art"><div class="arch"><img src="file://{ROOT}/assets/img/hero-1200.webp"></div></div></body>"""


def main():
    tmp = ROOT / "tools" / "_og.html"
    tmp.write_text(HTML, encoding="utf-8")
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, headless=True, args=["--allow-file-access-from-files"])
        pg = b.new_page(viewport={"width": 1200, "height": 630})
        pg.goto(tmp.as_uri())
        pg.wait_for_timeout(600)
        png = pg.screenshot()
        b.close()
    tmp.unlink()
    Image.open(io.BytesIO(png)).convert("RGB").save(ROOT / "assets" / "img" / "og.jpg", quality=88, optimize=True)
    print("assets/img/og.jpg written")


if __name__ == "__main__":
    sys.exit(main())
