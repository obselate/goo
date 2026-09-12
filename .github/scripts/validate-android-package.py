#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("package", type=Path)
    parser.add_argument("--abi", action="append", choices=("arm64-v8a", "x86_64"))
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    manifest = json.loads((root / "tools/Goo.TextNative/manifest.json").read_text())
    policy = manifest["build"]["android"]
    abis = args.abi or ["arm64-v8a", "x86_64"]
    with zipfile.ZipFile(args.package) as package, tempfile.TemporaryDirectory() as directory:
        names = package.namelist()
        prefix = "base/" if args.package.suffix == ".aab" else ""
        forbidden = [name for name in names if re.search(r"lib(?:SDL|Skia|goo-freetype|goo-text-native)", name, re.IGNORECASE)]
        if forbidden:
            raise SystemExit(f"Unexpected legacy or desktop native payloads: {forbidden}")
        for abi in abis:
            rid = "android-arm64" if abi == "arm64-v8a" else "android-x64"
            provenance = json.loads((root / "Goo/Runtime/Vulkan" / rid / "text-native-build.json").read_text())
            for name, filename in manifest["outputs"][rid].items():
                member = f"{prefix}lib/{abi}/{filename}"
                if names.count(member) != 1:
                    raise SystemExit(f"Expected one native payload: {member}")
                data = package.read(member)
                if hashlib.sha256(data).hexdigest() != provenance["artifacts"][name]["sha256"]:
                    raise SystemExit(f"Packaged native payload differs from build provenance: {member}")
                binary = Path(directory) / filename
                binary.write_bytes(data)
                dynamic = subprocess.check_output(["readelf", "--dynamic", str(binary)], text=True)
                needed = sorted(re.findall(r"Shared library: \[([^]]+)\]", dynamic))
                if needed != sorted(policy["requiredNeeded"][name]):
                    raise SystemExit(f"Android dependency mismatch: {member}: {needed}")
                headers = subprocess.check_output(["readelf", "--program-headers", "--wide", str(binary)], text=True)
                alignment = [int(line.split()[-1], 16) for line in headers.splitlines() if line.strip().startswith("LOAD ")]
                if not alignment or min(alignment) < policy["minimumPageAlignment"]:
                    raise SystemExit(f"Android 16 KB page alignment missing: {member}")
                print(f"Verified {member}")
    print(f"Android package OK: {args.package}")


if __name__ == "__main__":
    main()
