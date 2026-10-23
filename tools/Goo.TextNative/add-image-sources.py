#!/usr/bin/env python3
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--source-root", required=True, type=Path)
    args = parser.parse_args()
    source = json.loads(args.manifest.read_text(encoding="utf-8"))["source"]["stbImage"]
    with urllib.request.urlopen(source["url"], timeout=60) as response:
        header = response.read()
    if hashlib.sha256(header).hexdigest() != source["sha256"]:
        raise SystemExit("stb_image.h hash drift")
    sources = args.source_root / "src"
    (sources / "stb_image.h").write_bytes(header)
    for name in ("stb-gif-two-back", "stb-png-empty-idat"):
        subprocess.run([
            sys.executable, str(Path(__file__).resolve().parent / "apply-source-patches.py"),
            "--manifest", str(args.manifest), "--source-root", str(args.source_root),
            "--patch-name", name,
        ], check=True)
    shutil.copyfile(Path(__file__).resolve().parent / "goo-image.c", sources / "goo-image.c")
    meson = sources / "meson.build"
    text = meson.read_text(encoding="utf-8")
    marker = "\n    hb_gpu_sources,\n"
    if text.count(marker) != 1:
        raise SystemExit("HarfBuzz Meson GPU source shape drift")
    meson.write_text(text.replace(marker, "\n    hb_gpu_sources, files('goo-image.c'),\n"), encoding="utf-8")


if __name__ == "__main__":
    main()
