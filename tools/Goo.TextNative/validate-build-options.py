import json
import re
import sys
from pathlib import Path

build = Path(sys.argv[1])
options = {item["name"]: item["value"] for item in json.loads((build / "meson-info/intro-buildoptions.json").read_text(encoding="utf-8"))}
for name in ("wasm", "subset"):
    if options.get(name) != "disabled":
        raise SystemExit(f"HarfBuzz {name} must be disabled")
features = (build / "src/hb-features.h").read_text(encoding="utf-8")
if re.search(r"^\s*#\s*define\s+HB_HAS_(WASM|SUBSET)\b", features, re.MULTILINE):
    raise SystemExit("HarfBuzz generated features enable wasm or subset")
print("Verified disabled HarfBuzz components: wasm, subset")
