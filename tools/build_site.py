#!/usr/bin/env python3
"""Build the V9 pages from src/pages/*.html + src/partials/*.html.

    python3 tools/build_site.py

Authoring conventions (see README):
  * Persian is the markup language; English goes in an `en="…"` attribute on the same element
    (also en-alt, en-aria-label, en-title, en-content, en-placeholder, en-data-w …). Every page is built
    twice: Persian at /<page>.html and English at /en/<page>.html, each fully pre-rendered with hreflang links.
  * <img data-img="name"> expands to a responsive <img> (src, srcset, size, lazy loading, average colour).
  * {{component}} placeholders are expanded here (apartment cards, timeline, …).
  * Each page starts with <!--page key=… nav=… title_fa=… title_en=… desc_fa=… desc_en=… [og=…] [noindex=1]-->
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
META = json.loads((ROOT / "assets" / "img" / "images.json").read_text())
HOST = "https://ganjinehofogh.ir"
FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")

# ───────────────────────── apartments (v25 areas; layout shape matched to the furnished 3D models) ─────────────────────────
APARTMENTS = [
    dict(n=1, area="143.25", img="apt1", viewer=0, legacy="A",
         tag_fa="سه‌خوابه؛ پلانی کشیده با اتاق‌های خواب در یک ردیف",
         tag_en="Three bedrooms; a long plan with the bedrooms in a row",
         pts=[("فضای روز", "Day zone", "نشیمن، غذاخوری و پیشخوان آشپزخانه در یک فضای کشیده.", "Living, dining and the kitchen counter in one long space."),
              ("اتاق‌های خواب", "Bedrooms", "سه اتاق خواب کنار هم، در یک سمت پلان.", "Three bedrooms side by side along one edge of the plan."),
              ("تراس", "Terrace", "یک تراس کوچک در گوشه‌ی دور پلان.", "A small terrace at the far corner of the plan.")],
         shape_fa="کشیده، خطی", shape_en="Long, linear"),
    dict(n=2, area="150", img="apt2", viewer=1, legacy="D",
         tag_fa="سه‌خوابه؛ پلان ال‌شکل با جزیره‌ی مرکزی آشپزخانه",
         tag_en="Three bedrooms; an L-shaped plan with a central kitchen island",
         pts=[("فضای روز", "Day zone", "آشپزخانه با جزیره‌ی مرکزی و میز غذاخوری بلند.", "A kitchen with a central island and a long dining table."),
              ("نشیمن", "Living", "نشیمن در گوشه‌ی پلان ال‌شکل.", "The living room sits at the corner of the L."),
              ("اتاق‌های خواب", "Bedrooms", "سه اتاق خواب در بخش بالایی و کناره‌ی پلان.", "Three bedrooms along the upper part and the side of the plan.")],
         shape_fa="ال‌شکل", shape_en="L-shaped"),
    dict(n=3, area="166", img="apt3", viewer=3, legacy="C",
         tag_fa="سه‌خوابه؛ سه اتاق خواب در یک لبه و محور بلند آشپزخانه و ناهارخوری",
         tag_en="Three bedrooms along one edge, with a long kitchen-and-dining spine",
         pts=[("اتاق‌های خواب", "Bedrooms", "سه اتاق خواب روی هم در لبه‌ی چپ پلان.", "Three bedrooms stacked along the left edge of the plan."),
              ("فضای روز", "Day zone", "آشپزخانه و ناهارخوری در یک محور بلند.", "Kitchen and dining along one long spine."),
              ("نشیمن", "Living", "فضای نشیمن در بخش بالایی پلان.", "The living area at the top of the plan.")],
         shape_fa="بلند، عمودی", shape_en="Tall, vertical"),
    dict(n=4, area="162", img="apt4", viewer=2, legacy="B",
         tag_fa="سه‌خوابه؛ پلان فشرده با تفکیک فضای خصوصی و روز",
         tag_en="Three bedrooms; a compact plan separating private and day zones",
         pts=[("اتاق‌های خواب", "Bedrooms", "دو اتاق خواب در بالا و سومی کنار نشیمن.", "Two bedrooms at the top and a third beside the living room."),
              ("فضای روز", "Day zone", "نشیمن و ناهارخوری در بخش پایینی پلان.", "Living and dining at the base of the plan."),
              ("پلان", "Plan", "چیدمانی فشرده با تفکیک روشن فضای خصوصی و روز.", "A compact arrangement with a clear split between private and day zones.")],
         shape_fa="فشرده", shape_en="Compact"),
]
for a in APARTMENTS:
    a["area_fa"] = a["area"].translate(FA_DIGITS).replace(".", "٫")
    a["n_fa"] = str(a["n"]).translate(FA_DIGITS)


def esc(s):
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


# ───────────────────────── components ─────────────────────────
def apt_cards(sizes="(max-width: 560px) 92vw, (max-width: 1100px) 46vw, 24vw"):
    out = []
    for a in APARTMENTS:
        out.append(f'''<a class="card apt-card rv" href="residence-{a["n"]}.html" style="--d:{(a["n"]-1)*0.07:.2f}s">
  <div class="frame"><img data-img="{a["img"]}" sizes="{sizes}" alt="برش سه‌بعدی واحد {a["n_fa"]}" en-alt="Three-dimensional cut-away of Apartment {a["n"]}"></div>
  <div class="tagline"><h3 en="Apartment {a["n"]}">واحد {a["n_fa"]}</h3><span class="area num" dir="ltr"><bdi en="{a["area"]}">{a["area_fa"]}</bdi><small en="m²">م²</small></span></div>
  <p en="{esc(a["tag_en"])}">{a["tag_fa"]}</p>
  <span class="more"><span en="Plan and details">پلان و جزئیات</span><svg class="flip" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
</a>''')
    return "\n".join(out)


def timeline():
    items = json.loads((SRC / "timeline.json").read_text(encoding="utf-8"))
    groups = {}
    for it in items:
        groups.setdefault(it["y"] // 10 * 10, []).append(it)
    html = []
    for dec, its in groups.items():
        rows = []
        for it in its:
            fa_main, fa_sub = it["fa"]
            en_main, en_sub = it["en"]
            y = str(it["y"])
            rows.append(
                f'<li><i en="{y}">{y.translate(FA_DIGITS)}</i>'
                f'<span en="{esc(en_main)}<em>{esc(en_sub)}</em>">{fa_main}<em>{fa_sub}</em></span></li>'
            )
        html.append(f'<div class="decade rv"><b en="{dec}s">دهه {str(dec).translate(FA_DIGITS)}</b><ul>{"".join(rows)}</ul></div>')
    return "\n".join(html)


def next_cta(spec):
    fa_t, en_t, fa_p, en_p, fa_b, en_b, href = [s.strip() for s in spec.split("|")]
    return f'''<section class="section band visit" id="visit" aria-label="{fa_t}" en-aria-label="{en_t}">
  <div class="wrap visit__grid">
    <div class="rv">
      <h2 class="h2" en="{esc(en_t)}">{fa_t}</h2>
      <p class="lede" style="margin-block-start:1rem" en="{esc(en_p)}">{fa_p}</p>
    </div>
    <div class="rv" style="--d:.1s"><div class="visit__acts">
      <a class="btn btn--light" href="{href}" en="{esc(en_b)}">{fa_b}</a>
      <a class="btn btn--lineLight" href="contact.html#appointment" en="Private viewing">رزرو بازدید خصوصی</a>
    </div></div>
  </div>
</section>'''


def og_file(name):
    """Pick the file nearest 1200 px wide for a Open Graph image (accepts 'name' or 'name-1200')."""
    base = re.sub(r"-\d+$", "", name)
    info = META.get(base)
    if not info:
        sys.exit(f"unknown og image: {name}")
    best = min(info["files"], key=lambda f: abs(f["w"] - 1200))
    return best["file"][:-5]


def partial(name):
    return (SRC / "partials" / f"{name}.html").read_text(encoding="utf-8")


def marquee():
    """Seamless drifting band of the three words of the design approach (two identical halves, animated by -50 %)."""
    words = [("نور", "Light"), ("آرامش", "Calm"), ("پیوند", "Connection")]
    half = "".join(f'<span><span class="mw" data-w="{fa}" en-data-w="{en}"></span><b></b></span>' for _ in range(4) for fa, en in words)
    return f'<div class="marquee" aria-hidden="true"><div class="marquee__track">{half}{half}</div></div>'


def orn():
    """Brand ornament: an arch with the sun above the horizon; draws itself when it scrolls into view."""
    return ('<svg class="orn rv" viewBox="0 0 120 64" aria-hidden="true" focusable="false">'
            '<path d="M30 58V34a30 30 0 0 1 60 0v24" /><path d="M6 58h108" /><circle cx="60" cy="30" r="7" /></svg>')


def dots():
    items = [("top", "آغاز", "Start"), ("tower", "رویکرد", "Approach"), ("daydusk", "روز و غروب", "Day & dusk"),
             ("explore", "مدل سه‌بعدی", "3D model"), ("architecture", "معماری", "Architecture"),
             ("residences", "واحدها", "Residences"), ("location", "موقعیت", "Location"), ("visit", "بازدید", "Visit")]
    lis = "".join(f'<li><a href="#{i}" data-dot="{i}"><span en="{en}">{fa}</span><i></i></a></li>' for i, fa, en in items)
    return f'<nav class="dots" aria-label="بخش‌های صفحه" en-aria-label="Page sections"><ul>{lis}</ul></nav>'


COMPONENTS = {
    "orn": orn,
    "dots": dots,
    "marquee": marquee,
    "apt_cards": apt_cards,
    "timeline": timeline,
    "map": lambda: partial("map"),
    "tower_viewer": lambda: partial("tower_viewer"),
    "plan_explorer": lambda: partial("plan_explorer"),
    "nearby": lambda: partial("nearby"),
    "principles": lambda: partial("principles"),
}


def expand_components(html):
    html = re.sub(r"\{\{next:([^}]+)\}\}", lambda m: next_cta(m.group(1)), html)
    return re.sub(r"\{\{(\w+)\}\}", lambda m: COMPONENTS[m.group(1)]() if m.group(1) in COMPONENTS else m.group(0), html)


# ───────────────────────── site configuration (contact channels, analytics) ─────────────────────────
CFG_PATH = SRC / "site.config.json"
CFG = json.loads(CFG_PATH.read_text(encoding="utf-8")) if CFG_PATH.exists() else {}
HANDLE = re.compile(r"^[A-Za-z0-9._-]{2,64}$")


def channels():
    """Contact channels from site.config.json. Nothing is rendered for an empty field, so no placeholder ever ships."""
    out = []
    phone = re.sub(r"[^\d+]", "", CFG.get("phone", ""))
    if phone:
        shown = CFG.get("phone_display") or CFG["phone"]
        out.append(f'<li><a href="tel:{phone}" dir="ltr"><span en="Phone">تلفن</span><b>{esc(shown)}</b></a></li>')
    wa = re.sub(r"\D", "", CFG.get("whatsapp", ""))
    if wa:
        out.append(f'<li><a href="https://wa.me/{wa}" rel="noopener" target="_blank"><span>WhatsApp</span><b en="Message us">پیام در واتس‌اپ</b></a></li>')
    for key, base, fa, en in (("telegram", "https://t.me/", "تلگرام", "Telegram"), ("eitaa", "https://eitaa.com/", "ایتا", "Eitaa"),
                              ("rubika", "https://rubika.ir/", "روبیکا", "Rubika"), ("instagram", "https://instagram.com/", "اینستاگرام", "Instagram")):
        h = CFG.get(key, "").lstrip("@")
        if h and HANDLE.match(h):
            out.append(f'<li><a href="{base}{h}" rel="noopener" target="_blank"><span en="{en}">{fa}</span><b dir="ltr">@{h}</b></a></li>')
    email = CFG.get("email", "")
    if re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
        out.append(f'<li><a href="mailto:{email}" dir="ltr"><span en="Email">ایمیل</span><b>{esc(email)}</b></a></li>')
    if not out:
        return ""
    hours = ""
    if CFG.get("hours_fa") or CFG.get("hours_en"):
        hours = f'<p class="fine" en="{esc(CFG.get("hours_en", ""))}">{CFG.get("hours_fa", "")}</p>'
    return f'<ul class="channels">{"".join(out)}</ul>{hours}'


def channels_note():
    if has_channels():
        return ""
    return ('<p class="note" style="margin-block-start:1.4rem" en="Project location: Ozgol, Tehran. Direct contact details have not yet been approved for publication.">'
            'موقعیت پروژه: تهران، ازگل. اطلاعات تماس مستقیم هنوز برای انتشار تأیید نشده است.</p>')


COMPONENTS["channels"] = channels
COMPONENTS["channels_note"] = channels_note


def has_channels():
    return bool(channels())


def analytics_tag():
    a = CFG.get("analytics") or {}
    src = a.get("src", "")
    if not src.startswith("https://"):
        return ""
    dom = f' data-domain="{esc(a["domain"])}"' if a.get("domain") else ""
    return f'<script defer{dom} src="{esc(src)}"></script>'


# ───────────────────────── asset pipeline: one CSS file, minified, cache-busted ─────────────────────────
def esbuild(args, text=None):
    exe = shutil.which("esbuild")
    cmd = [exe] if exe else ["npx", "--yes", "esbuild"]
    try:
        r = subprocess.run(cmd + args, input=text, capture_output=True, text=True, timeout=120)
        return r.stdout if r.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


ASSET_VER = {}


def build_assets():
    """site.css + fonts.css -> site.min.css (one render-blocking request); JS -> *.min.js. Falls back to unminified."""
    css = (ROOT / "assets/css/site.css").read_text(encoding="utf-8")
    fonts = (ROOT / "assets/fonts/fonts.css").read_text(encoding="utf-8")
    fonts = re.sub(r"url\(([^)]+\.woff2)\)", r"url(../fonts/\1)", fonts)
    bundle = fonts + "\n" + css
    mini = esbuild(["--loader=css", "--minify"], bundle)
    (ROOT / "assets/css/site.min.css").write_text(mini if mini else bundle, encoding="utf-8")
    ASSET_VER["css"] = hashlib.sha1((mini or bundle).encode()).hexdigest()[:8]
    for name in ("site", "motion", "contact", "confirmation", "jalali"):
        src = ROOT / "assets/js" / f"{name}.js"
        if not src.exists():
            continue
        text = src.read_text(encoding="utf-8")
        m = esbuild(["--loader=js", "--minify", "--target=es2017"], text)
        (ROOT / "assets/js" / f"{name}.min.js").write_text(m if m else text, encoding="utf-8")
        ASSET_VER[name] = hashlib.sha1((m or text).encode()).hexdigest()[:8]
    return bool(mini)


# ───────────────────────── image + attribute expansion ─────────────────────────
TAG = re.compile(r"<img\b([^>]*?)\bdata-img=\"([\w-]+)\"([^>]*?)/?>", re.S)


def expand_img(m):
    before, name, after = m.group(1), m.group(2), m.group(3)
    if name not in META:
        sys.exit(f"unknown image: {name}")
    info = META[name]
    files = sorted(info["files"], key=lambda f: f["w"])
    big = files[-1]
    attrs = (before + " " + after).strip()
    eager = "data-eager" in attrs
    attrs = re.sub(r"\bdata-eager\b", "", attrs).strip()
    srcset = ", ".join(f"assets/img/{f['file']} {f['w']}w" for f in files)
    parts = [f'src="assets/img/{big["file"]}"', f'srcset="{srcset}"', f'width="{big["w"]}"', f'height="{big["h"]}"',
             'decoding="async"', 'loading="eager" fetchpriority="high"' if eager else 'loading="lazy"',
             f'style="background-color:{info["color"]}"']
    if "alt=" not in attrs:
        parts.append('alt=""')
    return "<img " + " ".join(parts) + (" " + attrs if attrs else "") + ">"


PERSIAN_NUM = re.compile(r"<(b|i|small|span|bdi|strong)((?:\s[^>]*)?)>([۰-۹٫٬]+)</\1>")
LATIN = str.maketrans("۰۱۲۳۴۵۶۷۸۹٫٬", "0123456789.,")


def number_twins(html):
    def add(m):
        if re.search(r"\sen=\"", m.group(2)):
            return m.group(0)
        return f'<{m.group(1)}{m.group(2)} en="{m.group(3).translate(LATIN)}">{m.group(3)}</{m.group(1)}>'
    return PERSIAN_NUM.sub(add, html)


# ───────────────────────── language split ─────────────────────────
TEXT_EN = re.compile(r'<(?P<tag>[a-zA-Z][\w-]*)(?P<a>[^<>]*?)\sen="(?P<en>[^"]*)"(?P<b>[^<>]*)>(?P<inner>.*?)</(?P=tag)>', re.S)
START_TAG = re.compile(r"<[a-zA-Z][^<>]*>")
EN_ATTR_RE = re.compile(r'\sen-([\w-]+)="([^"]*)"')
EN_PLAIN = re.compile(r'\sen="[^"]*"')


def to_language(html, lang):
    """Resolve every en / en-* pair for one language and drop the markers."""
    if lang == "en":
        html = TEXT_EN.sub(lambda m: f"<{m.group('tag')}{m.group('a')}{m.group('b')}>{m.group('en')}</{m.group('tag')}>", html)

    def fix(m):
        tag = m.group(0)
        pairs = EN_ATTR_RE.findall(tag)
        if not pairs and not EN_PLAIN.search(tag):
            return tag
        tag = EN_PLAIN.sub("", tag)
        for name, val in pairs:
            tag = EN_ATTR_RE.sub("", tag, count=1)
            if lang == "en":
                if re.search(r'\s%s="[^"]*"' % re.escape(name), tag):
                    tag = re.sub(r'(\s%s=")[^"]*(")' % re.escape(name), lambda mm: mm.group(1) + val + mm.group(2), tag, count=1)
                else:
                    tag = tag[:-1] + f' {name}="{val}">'
        return tag
    return START_TAG.sub(fix, html)


def balanced(html):
    """Cheap structural check: the same number of open/close tags per element name."""
    from html.parser import HTMLParser
    VOID = {"meta", "link", "img", "input", "br", "hr", "source", "path", "circle", "rect", "stop", "use"}

    class P(HTMLParser):
        def __init__(s):
            super().__init__()
            s.d = {}
        def handle_starttag(s, t, a):
            if t not in VOID:
                s.d[t] = s.d.get(t, 0) + 1
        def handle_startendtag(s, t, a):
            pass
        def handle_endtag(s, t):
            if t not in VOID:
                s.d[t] = s.d.get(t, 0) - 1
    p = P()
    p.feed(html)
    return {k: v for k, v in p.d.items() if v}


def prefix_assets(html):
    """English pages live in /en/, so shared assets and the viewers are one level up."""
    html = re.sub(r'(\b(?:href|src|imagesrcset|data-src)=")(?!https?:|/|#|data:|mailto:|tel:)(assets/|tower-viewer/|residences-3d/|favicon\.svg)', r"\1../\2", html)
    html = re.sub(r'(srcset=")([^"]+)(")', lambda m: m.group(1) + re.sub(r"(^|,\s*)(assets/)", r"\1../\2", m.group(2)) + m.group(3), html)
    return html


# ───────────────────────── pages ─────────────────────────
META_RE = re.compile(r"<!--page\s+(.*?)-->\s*", re.S)
KV_RE = re.compile(r'(\w+)="([^"]*)"')


def jsonld(lang):
    d = {"@context": "https://schema.org", "@type": "ApartmentComplex", "name": "برج گنجینه افق" if lang == "fa" else "Ganjineh Ofogh",
         "alternateName": "Ganjineh Ofogh" if lang == "fa" else "برج گنجینه افق",
         "url": HOST + ("/" if lang == "fa" else "/en/"),
         "image": HOST + "/assets/img/og.jpg",
         "address": {"@type": "PostalAddress", "addressLocality": "Tehran", "addressRegion": "Tehran", "addressCountry": "IR"}}
    phone = re.sub(r"[^\d+]", "", CFG.get("phone", ""))
    if phone:
        d["telephone"] = phone
    return '<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + "</script>"


def alt_name(out_name, lang):
    return ("en/" + out_name) if lang == "fa" else ("../" + out_name)


def build_page(meta, body, out_name, lang):
    head = partial("head")
    nav = meta.get("nav", "")
    og = "og"  # designed share image (assets/img/og.jpg)
    robots = '<meta name="robots" content="noindex, follow">' if meta.get("noindex") else ""
    preload = ""
    if meta.get("preload"):
        info = META[meta["preload"]]
        files = sorted(info["files"], key=lambda f: f["w"])
        srcset = ", ".join(f"assets/img/{f['file']} {f['w']}w" for f in files)
        small = next((f for f in files if f["w"] >= 700), files[0])
        preload = (f'<link rel="preload" as="image" href="assets/img/{small["file"]}" imagesrcset="{srcset}" '
                   f'imagesizes="(max-width: 880px) 86vw, 46vw" fetchpriority="high">')
    fa_font = "Vazirmatn-normal-arabic.woff2"
    preload += f'\n<link rel="preload" href="assets/fonts/{fa_font}" as="font" type="font/woff2" crossorigin>'
    scripts = [f'<script src="assets/js/site.min.js?v={ASSET_VER["site"]}" defer></script>',
               f'<script src="assets/js/motion.min.js?v={ASSET_VER["motion"]}" defer></script>']
    for extra in filter(None, meta.get("scripts", "").split(",")):
        base = extra.replace(".js", "")
        scripts.append(f'<script src="assets/js/{base}.min.js?v={ASSET_VER[base]}" defer></script>')
    tag = analytics_tag()
    if tag:
        scripts.append(tag)
    other = "en" if lang == "fa" else "fa"
    path_here = ("" if out_name == "index.html" else out_name)
    url_fa = HOST + "/" + path_here
    url_en = HOST + "/en/" + path_here
    subs = {
        "key": meta["key"], "lang": lang, "dir": "rtl" if lang == "fa" else "ltr", "base": "" if lang == "fa" else "../",
        "title": meta["title_" + lang], "desc": meta["desc_" + lang], "file": out_name, "og": og, "robots": robots, "preload": preload,
        "css": f'assets/css/site.min.css?v={ASSET_VER["css"]}',
        "jsonld": jsonld(lang) if meta["key"] == "index" else "", "scripts": "\n".join(scripts),
        "canonical": url_fa if lang == "fa" else url_en, "url_fa": url_fa, "url_en": url_en,
        "alt_href": alt_name(out_name, lang), "other_lang": other,
        "locale": "fa_IR" if lang == "fa" else "en_US", "locale_alt": "en_US" if lang == "fa" else "fa_IR",
    }
    for k, v in subs.items():
        head = head.replace("{{" + k + "}}", v)
    header = partial("header")
    if nav:
        header = re.sub(r'(<a [^>]*data-nav="' + re.escape(nav) + r'")', r'\1 aria-current="page"', header)
    footer = partial("footer")
    for k, v in subs.items():
        footer = footer.replace("{{" + k + "}}", v)
    html = head + header + body + footer
    html = expand_components(html)
    html = TAG.sub(expand_img, html)
    html = number_twins(html)
    html = to_language(html, lang)
    if lang == "en":
        html = prefix_assets(html)
    if meta["key"] == "404":  # served for any missing path, so every URL must be root-absolute
        html = re.sub(r'(href|src)="(?!https?:|/|#|data:|mailto:)', r'\1="/', html)
        html = re.sub(r'(href|src)="(?:\.\./)+', r'\1="/', html)
        if lang == "en":
            html = re.sub(r'href="/(?!assets|en/|favicon)([\w-]+\.html)', r'href="/en/\1', html)
    out_dir = ROOT if lang == "fa" else ROOT / "en"
    out_dir.mkdir(exist_ok=True)
    (out_dir / out_name).write_text(html, encoding="utf-8")
    return len(html), balanced(html)


def main():
    minified = build_assets()
    built = []
    pages_dir = SRC / "pages"

    def emit(meta, body, out):
        for lang in ("fa", "en"):
            size, unbalanced = build_page(meta, body, out, lang)
            if unbalanced:
                print(f"WARNING {lang}/{out}: unbalanced tags {unbalanced}")
            built.append((out if lang == "fa" else "en/" + out, size, meta))

    for f in sorted(pages_dir.glob("*.html")):
        text = f.read_text(encoding="utf-8")
        m = META_RE.match(text)
        if not m:
            sys.exit(f"{f.name}: missing <!--page …--> header")
        meta = dict(KV_RE.findall(m.group(1)))
        body = text[m.end():]
        if f.name.startswith("_residence"):
            for a in APARTMENTS:
                b = body
                rep = {
                    "{{n}}": str(a["n"]), "{{n_fa}}": a["n_fa"], "{{area}}": a["area"], "{{area_fa}}": a["area_fa"],
                    "{{img}}": a["img"], "{{tag_fa}}": a["tag_fa"], "{{tag_en}}": esc(a["tag_en"]),
                    "{{shape_fa}}": a["shape_fa"], "{{shape_en}}": a["shape_en"],
                }
                for i, (pf, pe, tf, te) in enumerate(a["pts"], 1):
                    rep.update({f"{{{{p{i}_fa}}}}": pf, f"{{{{p{i}_en}}}}": pe, f"{{{{t{i}_fa}}}}": tf, f"{{{{t{i}_en}}}}": esc(te)})
                others = [o for o in APARTMENTS if o["n"] != a["n"]]
                rep["{{others}}"] = "\n".join(
                    f'<a class="card apt-card" href="residence-{o["n"]}.html"><div class="frame"><img data-img="{o["img"]}" sizes="(max-width: 560px) 92vw, 30vw" alt="برش سه‌بعدی واحد {o["n_fa"]}" en-alt="Three-dimensional cut-away of Apartment {o["n"]}"></div>'
                    f'<div class="tagline"><h3 en="Apartment {o["n"]}">واحد {o["n_fa"]}</h3><span class="area num" dir="ltr"><bdi en="{o["area"]}">{o["area_fa"]}</bdi><small en="m²">م²</small></span></div>'
                    f'<p en="{esc(o["tag_en"])}">{o["tag_fa"]}</p></a>'
                    for o in others)
                for k, v in rep.items():
                    b = b.replace(k, v)
                mm = dict(meta)
                for k in ("title_fa", "title_en", "desc_fa", "desc_en"):
                    for kk, vv in rep.items():
                        mm[k] = mm[k].replace(kk, vv)
                mm["key"] = f"residence-{a['n']}"
                mm["og"] = a["img"]
                emit(mm, b, f"residence-{a['n']}.html")
            continue
        emit(meta, body, meta.get("out", f.name))

    # sitemap: public pages only (thank-you and 404 stay out), each with its language alternates
    public = [name for name, _, meta in built if not meta.get("noindex") and not name.startswith("en/")]
    order = ["index.html", "project.html", "architecture.html", "residences.html", "residence-1.html", "residence-2.html",
             "residence-3.html", "residence-4.html", "lifestyle.html", "location.html", "gallery.html", "developer.html",
             "contact.html", "privacy.html"]
    urls = [u for u in order if u in public] + [u for u in public if u not in order]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for u in urls:
        p = "" if u == "index.html" else u
        fa, en = f"{HOST}/{p}", f"{HOST}/en/{p}"
        for loc in (fa, en):
            sm.append(f'  <url><loc>{loc}</loc><xhtml:link rel="alternate" hreflang="fa" href="{fa}"/>'
                      f'<xhtml:link rel="alternate" hreflang="en" href="{en}"/>'
                      f'<xhtml:link rel="alternate" hreflang="x-default" href="{fa}"/></url>')
    sm.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(sm) + "\n", encoding="utf-8")
    total = sum(s for _, s, _ in built)
    print(f"{len(built)} pages ({len(built) // 2} per language), {total / 1024:.0f} KB HTML, sitemap {len(urls) * 2} URLs, "
          f"assets {'minified' if minified else 'NOT minified (esbuild unavailable)'}: css {ASSET_VER['css']} js {ASSET_VER['site']}")


if __name__ == "__main__":
    main()
