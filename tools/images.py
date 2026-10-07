#!/usr/bin/env python3
"""Připraví zmenšené fotky pro web (spouštět lokálně na macOS – používá sips).

  python3 tools/images.py

Výstup jde do assets/img/web/ a commituje se, takže build (i na Vercelu) žádné úpravy obrázků nedělá.
"""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGES = {  # název: zdroj v assets/img/src
    "hero": "hero-2.jpg",
    "kladno": "kladno-1.jpg",
    "konzultace": "hero-1.jpg",
    "dopisy": "documents-1.jpg",
}
WIDTHS = (800, 1400)
OUT = ROOT / "assets/img/web"


def size(path):
    info = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)], capture_output=True, text=True).stdout
    return int(re.search(r"pixelWidth: (\d+)", info).group(1)), int(re.search(r"pixelHeight: (\d+)", info).group(1))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = {}
    for name, src in IMAGES.items():
        src_path = ROOT / "assets/img/src" / src
        for w in WIDTHS:
            target = OUT / f"{name}-{w}.jpg"
            subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "74", "--resampleWidth", str(w),
                            str(src_path), "--out", str(target)], check=True, capture_output=True)
        sizes[name] = size(OUT / f"{name}-{WIDTHS[-1]}.jpg")
    (OUT / "sizes.json").write_text(json.dumps({"widths": WIDTHS, "images": sizes}, indent=2))
    print("hotovo:", ", ".join(sizes))


if __name__ == "__main__":
    main()
