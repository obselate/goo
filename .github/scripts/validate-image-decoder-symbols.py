#!/usr/bin/env python3
import argparse
from pathlib import Path
import re
import subprocess


parser = argparse.ArgumentParser()
parser.add_argument("binaries", nargs="+", type=Path)
args = parser.parse_args()
for path in args.binaries:
    if path.suffix == ".dylib":
        command = ["llvm-nm", "--debug-syms", "--add-dyldinfo", str(path)]
    else:
        command = ["llvm-readobj", "--symbols", "--dyn-symbols", "--coff-imports", "--coff-exports", str(path)]
    symbols = subprocess.check_output(command, text=True)
    if "goo_image_decode_rgba" not in symbols:
        raise SystemExit(f"{path}: image decoder export missing")
    forbidden = re.findall(r"\b_?(?:stbi_load_gif_from_memory|stbi__load_gif_main)\b", symbols)
    if forbidden:
        raise SystemExit(f"{path}: multi-frame GIF symbols present: {', '.join(sorted(set(forbidden)))}")
    print(f"{path}: no multi-frame GIF symbols")
