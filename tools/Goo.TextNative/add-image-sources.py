#!/usr/bin/env python3
import argparse
import hashlib
import io
import json
import re
import shutil
import subprocess
import sys
import tarfile
import urllib.request
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--fuzz-output", type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))["source"]
    stb = manifest["stbImage"]
    with urllib.request.urlopen(stb["url"], timeout=60) as response:
        header = response.read()
    if hashlib.sha256(header).hexdigest() != stb["sha256"]:
        raise SystemExit("stb_image.h hash drift")
    sources = args.source_root / "src"
    sources.mkdir(parents=True, exist_ok=True)
    (sources / "stb_image.h").write_bytes(header)
    for name in ("stb-gif-two-back", "stb-png-empty-idat", "stb-jpeg-repeated-scan"):
        subprocess.run([
            sys.executable, str(Path(__file__).resolve().parent / "apply-source-patches.py"),
            "--manifest", str(args.manifest), "--source-root", str(args.source_root),
            "--patch-name", name,
        ], check=True)

    webp = manifest["libwebp"]
    with urllib.request.urlopen(webp["archiveUrl"], timeout=60) as response:
        archive = response.read()
    if hashlib.sha256(archive).hexdigest() != webp["archiveSha256"]:
        raise SystemExit("libwebp archive hash drift")
    webp_root = sources / "goo-webp"
    groups = {
        "dec": r"libwebpdecode_la_SOURCES",
        "dsp": r"COMMON_SOURCES|libwebpdspdecode_(?:sse2|sse41|avx2|neon)_la_SOURCES",
        "utils": r"COMMON_SOURCES",
    }
    webp_sources = []
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        upstream = "libwebp-" + webp["version"] + "/src/"
        for directory, group in groups.items():
            makefile = tar.extractfile(upstream + directory + "/Makefile.am").read().decode("ascii")
            names = re.findall(r"^(?:" + group + r") \+= (\w+\.c)$", makefile, re.MULTILINE)
            if not names:
                raise SystemExit("libwebp decoder source list drift: " + directory)
            webp_sources.extend("src/" + directory + "/" + name for name in names)
        for member in tar.getmembers():
            if not member.isfile() or not member.name.startswith(upstream):
                continue
            relative = "src/" + member.name[len(upstream):]
            if relative in webp_sources or relative.endswith(".h"):
                path = webp_root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(tar.extractfile(member).read())

    if args.fuzz_output:
        subprocess.run([
            "clang", "-O1", "-g", "-fno-omit-frame-pointer",
            "-fsanitize=fuzzer,address,undefined", "-fno-sanitize-recover=all",
            "-DWEBP_USE_THREAD", "-DWEBP_EXTERN=extern", "-pthread",
            "-I" + str(sources), "-I" + str(webp_root),
            *[str(webp_root / source) for source in webp_sources],
            str(Path(__file__).resolve().parents[1] / "Goo.InputFuzz/image.c"),
            "-lm", "-o", str(args.fuzz_output),
        ], check=True)
        return

    shutil.copyfile(Path(__file__).resolve().parent / "goo-image.c", sources / "goo-image.c")
    meson = sources / "meson.build"
    text = meson.read_text(encoding="utf-8")
    marker = "\n    include_directories: incconfig,\n    dependencies: gpu_deps,\n    link_with: [libharfbuzz],\n"
    if text.count(marker) != 1:
        raise SystemExit("HarfBuzz Meson GPU source shape drift")
    webp_files = ",\n    ".join("'goo-webp/" + source + "'" for source in webp_sources)
    setup = """  goo_webp_inc = include_directories('goo-webp')
  goo_webp_args = ['-DWEBP_EXTERN=extern']
  if host_machine.system() != 'emscripten'
    goo_webp_args += '-DWEBP_USE_THREAD'
  endif
  goo_webp = static_library('goo-webp', files(
    """ + webp_files + """
  ), include_directories: goo_webp_inc, dependencies: gpu_deps, c_args: goo_webp_args,
    gnu_symbol_visibility: 'hidden')
  goo_webp_link_args = []
  if host_machine.system() == 'windows'
    goo_webp_link_args += '-Wl,--exclude-libs,libgoo-webp.a'
  endif
"""
    text = text.replace("  libharfbuzz_gpu = library(", setup + "  libharfbuzz_gpu = library(", 1)
    text = text.replace("\n    hb_gpu_sources,\n", "\n    hb_gpu_sources, files('goo-image.c'),\n", 1)
    link_args = "    link_args: ['-Wl,-soname,libgoo-harfbuzz-gpu.so'],\n"
    if link_args.strip() in text:
        text = text.replace(link_args.strip(), link_args.strip()[:-1] + " + goo_webp_link_args,", 1)
        link_args = ""
    else:
        link_args = "    link_args: goo_webp_link_args,\n"
    meson.write_text(text.replace(marker, """
    include_directories: [incconfig, goo_webp_inc],
    dependencies: gpu_deps,
    link_with: [libharfbuzz],
    link_whole: goo_webp,
""" + link_args), encoding="utf-8")


if __name__ == "__main__":
    main()
