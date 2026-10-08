#!/usr/bin/env python3
"""Sestaví web Rada na dosah ze šablony src/layout.html a stránek src/pages/*.html.

  python3 tools/build.py            -> dist/     (produkce: čisté adresy /kontakt/, absolutní cesty; build na Vercelu)
  python3 tools/build.py preview    -> preview/  (náhled: ploché soubory kontakt.html, relativní cesty, formulář v ukázkovém režimu)

Build používá jen standardní knihovnu Pythonu. Fotky se zmenšují zvlášť (tools/images.py, macOS) do assets/img/web/.
Proměnné prostředí: SITE_URL (výchozí https://radanadosah.cz), FORM_ENDPOINT (výchozí /api/kontakt).

Zástupné značky ve stránkách:
  {{link:slug}}  {{asset:cesta}}  {{icon:nazev}}  {{picture:nazev|alt|eager/lazy|trida}}  {{logo}}
"""
import hashlib
import html
import json
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = os.environ.get("SITE_URL", "https://radanadosah.cz").rstrip("/")   # DOPLNIT: finální doména
FORM_ENDPOINT = os.environ.get("FORM_ENDPOINT", "/api/kontakt/")          # Vercel funkce api/kontakt.js
FORM_ACTION = "/api/kontakt/"                                            # záloha bez JavaScriptu (POST)

NAV = [
    ("uvod", "Úvod"),
    ("s-cim-pomahame", "S čím pomáháme"),
    ("sluzby", "Naše služby"),
    ("jak-to-funguje", "Jak to funguje"),
    ("caste-dotazy", "Časté dotazy"),
    ("o-nas", "O nás"),
    ("kontakt", "Kontakt"),
]
IMAGES = {  # název: object-position (zdroje a velikosti viz tools/images.py)
    "hero": "62% 50%",
    "kladno": "40% 60%",
    "konzultace": "50% 30%",
    "dopisy": "50% 50%",
}
SIZES = json.loads((ROOT / "assets/img/web/sizes.json").read_text())
WIDTHS = tuple(SIZES["widths"])

BUBBLES = (
    '<path class="{p}1" d="M11 0H19A11 11 0 0 1 30 11V15A11 11 0 0 1 19 26H0V11A11 11 0 0 1 11 0Z"/>'
    '<path class="{p}2" d="M29 12H37A11 11 0 0 1 48 23V38H29A11 11 0 0 1 18 27V23A11 11 0 0 1 29 12Z"/>'
    '<path class="{p}3" d="M29 12H30V15A11 11 0 0 1 19 26H18V23A11 11 0 0 1 29 12Z"/>'
)
LOGO = '<svg class="brand__mark" viewBox="0 0 48 38" aria-hidden="true" focusable="false">' + BUBBLES.format(p="brand__b") + '</svg>'
DECO = '<svg class="deco" viewBox="0 0 48 38" aria-hidden="true" focusable="false">' + BUBBLES.format(p="b") + '</svg>'


def page_url(slug, mode):
    if mode == "preview":
        return "./" if slug == "uvod" else f"{slug}.html"
    return "/" if slug == "uvod" else f"/{slug}/"


def out_path(slug, mode, out):
    if slug == "uvod":
        return out / "index.html"
    if mode == "preview" or slug == "404":
        return out / f"{slug}.html"
    return out / slug / "index.html"


def icon(name):
    svg = (ROOT / "assets/icons" / f"{name}.svg").read_text()
    inner = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S).group(1)
    return f'<svg class="i" viewBox="0 0 256 256" aria-hidden="true" focusable="false">{inner}</svg>'


def copy_images(out):
    """Zkopíruje předpřipravené fotky; vrací rozměry pro width/height."""
    dest = out / "assets/img"
    dest.mkdir(parents=True, exist_ok=True)
    for f in (ROOT / "assets/img/web").glob("*.jpg"):
        shutil.copy(f, dest / f.name)
    return {name: tuple(wh) for name, wh in SIZES["images"].items()}


def fingerprint(path):
    return hashlib.sha1((ROOT / path).read_bytes()).hexdigest()[:10]


def picture(arg, asset, dims):
    parts = arg.split("|")
    name, alt = parts[0], parts[1]
    loading = parts[2] if len(parts) > 2 else "lazy"
    cls = parts[3] if len(parts) > 3 else "hero__img"
    w, h = dims[name]
    pos = IMAGES[name]
    srcset = ", ".join(f"{asset(f'assets/img/{name}-{x}.jpg')} {x}w" for x in WIDTHS)
    sizes = "(min-width: 900px) 50vw, 100vw"
    prio = ' fetchpriority="high"' if loading == "eager" else ""
    return (f'<img class="{cls}" src="{asset(f"assets/img/{name}-{WIDTHS[-1]}.jpg")}" srcset="{srcset}" sizes="{sizes}" '
            f'alt="{html.escape(alt)}" width="{w}" height="{h}" loading="{loading}" decoding="async"{prio} style="object-position:{pos}">')


def faq_jsonld(content):
    items = []
    for m in re.finditer(r"<summary><span[^>]*>(.*?)</span>.*?</summary>\s*<div class=\"faq__answer\">(.*?)</div>", content, re.S):
        q = re.sub(r"<[^>]+>", "", m.group(1))
        a = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.group(2))).strip()
        items.append({"@type": "Question", "name": html.unescape(q), "acceptedAnswer": {"@type": "Answer", "text": html.unescape(a)}})
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": items}


ORG = {
    "@context": "https://schema.org",
    "@type": ["NGO", "LegalService"],
    "name": "Rada na dosah, z.ú.",
    "alternateName": "Rada na dosah",
    "description": "Bezplatné právní poradenství pro lidi v sociální nouzi na Kladně: nájem, dluhy, sociální dávky.",
    "url": SITE + "/",
    "email": "info@radanadosah.cz",
    "isAccessibleForFree": True,
    "areaServed": {"@type": "City", "name": "Kladno"},
    "address": {"@type": "PostalAddress", "streetAddress": "T. G. Masaryka 108", "postalCode": "272 01",
                "addressLocality": "Kladno", "addressCountry": "CZ"},
}


ADMIN_EXTRA = [
    ("ochrana-osobnich-udaju", "Ochrana osobních údajů"),
    ("pristupnost", "Prohlášení o přístupnosti"),
    ("dekujeme", "Děkujeme (po odeslání formuláře)"),
]


def build_admin(out):
    """Správa webu /admin/ (assets/js/admin.js): seznam stránek se vloží do HTML."""
    stranky = [{"slug": s, "nazev": n, "url": page_url(s, "prod")} for s, n in NAV + ADMIN_EXTRA]
    asset = lambda p: "/" + p + (f"?v={fingerprint(p)}" if p.endswith((".css", ".js")) else "")
    page = (ROOT / "src/admin.html").read_text()
    page = page.replace("{{stranky}}", json.dumps(stranky, ensure_ascii=False)).replace("{{logo}}", LOGO)
    page = re.sub(r"\{\{asset:([^}]+)\}\}", lambda m: asset(m.group(1)), page)
    (out / "admin").mkdir(exist_ok=True)
    (out / "admin/index.html").write_text(page)


def build(mode):
    out = ROOT / ("preview" if mode == "preview" else "dist")
    if out.exists():
        for p in out.iterdir():
            if p.name != "assets":
                shutil.rmtree(p) if p.is_dir() else p.unlink()
    out.mkdir(exist_ok=True)
    for sub in ("css", "js", "fonts"):
        shutil.copytree(ROOT / "assets" / sub, out / "assets" / sub, dirs_exist_ok=True)
    for p in (out / "assets/fonts").glob("_*.css"):
        p.unlink()
    dims = copy_images(out)
    if (ROOT / "assets/img/og.jpg").exists():
        shutil.copy(ROOT / "assets/img/og.jpg", out / "assets/img/og.jpg")
    shutil.copy(ROOT / "assets/img/favicon.svg", out / "assets/img/favicon.svg")

    layout = (ROOT / "src/layout.html").read_text()
    pages = sorted((ROOT / "src/pages").glob("*.html"))
    sitemap = []
    for src in pages:
        raw = src.read_text()
        meta = json.loads(re.match(r"<!--meta (.*?) -->", raw, re.S).group(1))
        content = raw[raw.index("-->") + 3:].strip()
        slug = meta["slug"]
        dest = out_path(slug, mode, out)
        dest.parent.mkdir(parents=True, exist_ok=True)

        if mode == "preview":
            asset = lambda p: p
            link = lambda s: page_url(s, mode)
        else:
            # CSS a JS s otiskem obsahu, aby šly cachovat natrvalo (viz vercel.json)
            asset = lambda p: "/" + p + (f"?v={fingerprint(p)}" if p.endswith((".css", ".js")) else "")
            link = lambda s: page_url(s, mode)

        current = ' aria-current="page"'
        nav = "\n        ".join(
            f'<li><a class="nav__link" href="{link(s)}"{current if meta.get("nav") == s else ""}>{label}</a></li>'
            for s, label in NAV)
        jsonld = [ORG] if slug == "uvod" else []
        if meta.get("faq"):
            jsonld.append(faq_jsonld(content))
        jsonld_html = "\n".join(f'<script type="application/ld+json">{json.dumps(j, ensure_ascii=False)}</script>' for j in jsonld)

        page = layout
        page = page.replace("{{content}}", content)
        page = page.replace("{{nav}}", nav).replace("{{logo}}", LOGO).replace("{{deco}}", DECO).replace("{{jsonld}}", jsonld_html)
        page = page.replace("{{title}}", html.escape(meta["title"])).replace("{{description}}", html.escape(meta["description"]))
        canonical = page_url(slug, "prod") if slug != "404" else "/404.html"
        page = page.replace("{{canonical}}", canonical).replace("{{site}}", SITE)
        page = page.replace("{{robots}}", '<meta name="robots" content="noindex">\n' if meta.get("noindex") else "")
        page = page.replace("{{bodyclass}}", meta.get("bodyclass", "page-" + slug))
        page = page.replace("{{form_action}}", FORM_ACTION).replace("{{form_endpoint}}", "" if mode == "preview" else FORM_ENDPOINT)
        page = re.sub(r"\{\{link:([\w-]+)\}\}", lambda m: link(m.group(1)), page)
        page = re.sub(r"\{\{asset:([^}]+)\}\}", lambda m: asset(m.group(1)), page)
        page = re.sub(r"\{\{icon:([\w-]+)\}\}", lambda m: icon(m.group(1)), page)
        page = re.sub(r"\{\{picture:([^}]+)\}\}", lambda m: picture(m.group(1), asset, dims), page)
        leftover = re.findall(r"\{\{[^}]+\}\}", page)
        if leftover:
            sys.exit(f"{src.name}: nenahrazené značky {leftover}")
        if mode == "preview" and slug == "uvod":
            # Artifact obalí hlavní stránku vlastní kostrou dokumentu: jen obsah hlavy a těla
            page = page.replace("<title>Rada na dosah – bezplatná poradna na Kladně</title>", "<title>Rada na dosah</title>")
            page = re.sub(r"<!doctype html>\s*<html[^>]*>\s*<head>", "", page)
            page = re.sub(r"</head>\s*<body([^>]*)>", lambda m: '<script>document.documentElement.lang="cs";document.body.className="page-home"</script>', page)
            page = page.replace("</body>", "").replace("</html>", "")
        dest.write_text(page)
        if not meta.get("noindex"):
            sitemap.append(SITE + page_url(slug, "prod"))

    if mode != "preview":
        build_admin(out)
        # Správa webu podle toho pozná, že je nová verze opravdu venku (Vercel nastaví sha commitu při buildu)
        (out / "verze.json").write_text(json.dumps({"sha": os.environ.get("VERCEL_GIT_COMMIT_SHA", "")}))
        (out / "sitemap.xml").write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "".join(f"  <url><loc>{u}</loc></url>\n" for u in sitemap) + "</urlset>\n")
        (out / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")
    print(f"{mode}: {len(pages)} stránek -> {out.relative_to(ROOT)}/")


if __name__ == "__main__":
    build("preview" if len(sys.argv) > 1 and sys.argv[1] == "preview" else "prod")
