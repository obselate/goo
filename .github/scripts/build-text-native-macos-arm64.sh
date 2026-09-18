#!/usr/bin/env bash
set -euo pipefail

output="${1:?usage: build-text-native-macos-arm64.sh OUTPUT_DIRECTORY}"
script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../.." && pwd)"
manifest="$repo_root/tools/Goo.TextNative/manifest.json"
hb_url='https://github.com/harfbuzz/harfbuzz/releases/download/14.3.1/harfbuzz-14.3.1.tar.xz'
hb_sha256='9dae9538aae2ffdf70cec31f2c27bf68e2aaeeae3112688467697d5faf6194f7'
deployment_target='14.0'

for command_name in awk codesign curl file lipo meson ninja nm otool patch python3 shasum strip tar xcodebuild; do
  command -v "$command_name" >/dev/null || { printf 'required command missing: %s\n' "$command_name" >&2; exit 1; }
done

python3 - "$manifest" "$hb_sha256" "$hb_url" <<'PY'
import json
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
source = manifest["source"]["harfbuzz"]
if source["version"] != "14.3.1" or source["tag"] != "14.3.1":
    raise SystemExit("HarfBuzz version/tag drift")
if source["signedTagCommit"] != "ab5ecbb83985034a76214ac0b2b833dcd590d774":
    raise SystemExit("HarfBuzz signed tag commit drift")
if source["archiveSha256"] != sys.argv[2] or source["archiveUrl"] != sys.argv[3]:
    raise SystemExit("HarfBuzz archive provenance drift")
if manifest["outputs"]["osx-arm64"] != {
    "harfbuzz": "libgoo-harfbuzz.dylib",
    "gpu": "libgoo-harfbuzz-gpu.dylib",
}:
    raise SystemExit("macOS output name drift")
if manifest["build"]["environments"]["osx-arm64"] != {
    "SOURCE_DATE_EPOCH": "0",
    "CFLAGS": "-O3 -g0 -ffile-prefix-map=<temporary-source-root>=.",
    "CXXFLAGS": "-O3 -g0 -ffile-prefix-map=<temporary-source-root>=.",
    "LDFLAGS": "-Wl,-dead_strip",
}:
    raise SystemExit("macOS build environment drift")
if manifest["build"]["macos"] != {
    "requiredFormat": "Mach-O 64-bit dynamically linked shared library arm64",
    "requiredArchitectures": ["arm64"],
    "requiredInstallName": {
        "harfbuzz": "@rpath/libgoo-harfbuzz.dylib",
        "gpu": "@rpath/libgoo-harfbuzz-gpu.dylib",
    },
    "requiredNeeded": {
        "harfbuzz": ["/usr/lib/libSystem.B.dylib"],
        "gpu": [
            "/usr/lib/libSystem.B.dylib",
            "@rpath/libgoo-harfbuzz.dylib",
        ],
    },
    "forbiddenDependencyPrefixes": ["/opt/homebrew/", "/usr/local/"],
}:
    raise SystemExit("macOS native policy drift")
required = {
    "-Dglib=disabled", "-Dgobject=disabled", "-Dcairo=disabled",
    "-Dchafa=disabled", "-Dpng=disabled", "-Dzlib=disabled",
    "-Dicu=disabled", "-Dgraphite=disabled", "-Dgraphite2=disabled",
    "-Dfreetype=disabled", "-Dfontations=disabled", "-Dgdi=disabled",
    "-Ddirectwrite=disabled", "-Dcoretext=disabled", "-Dharfrust=disabled",
    "-Dkbts=disabled", "-Dwasm=disabled", "-Draster=disabled",
    "-Dvector=disabled", "-Dgpu=enabled", "-Dsubset=disabled",
    "-Dtests=disabled", "-Dintrospection=disabled", "-Ddocs=disabled",
    "-Ddoc_tests=false", "-Dutilities=disabled", "-Dbenchmark=disabled",
    "-Dgpu_demo=disabled", "-Dwith_libstdcxx=false",
}
if set(manifest["build"]["harfbuzzOptions"]) != required:
    raise SystemExit("HarfBuzz integration options drift")
PY

work="$(mktemp -d -t goo-text-native-macos.XXXXXX)"
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$output"
output="$(CDPATH= cd -- "$output" && pwd)"
staging="$work/output"
mkdir -p "$staging"

curl -fsSL --retry 5 --retry-delay 2 --retry-max-time 120 --retry-all-errors \
  "$hb_url" -o "$work/harfbuzz.tar.xz"
printf '%s  %s\n' "$hb_sha256" "$work/harfbuzz.tar.xz" | shasum -a 256 -c -
tar -xJf "$work/harfbuzz.tar.xz" -C "$work"
python3 "$repo_root/tools/Goo.TextNative/apply-source-patches.py" --manifest "$manifest" --source-root "$work/harfbuzz-14.3.1"

python3 - "$work/harfbuzz-14.3.1/src/meson.build" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")

def patch_target(text, start_marker, end_marker, old_name, new_name, indent):
    start = text.find(start_marker)
    if start < 0 or text.find(start_marker, start + 1) >= 0:
        raise SystemExit(f"Meson target drift: {old_name}")
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"Meson target boundary drift: {old_name}")
    end += len(end_marker)
    block = text[start:end]
    block = block.replace(f"library('{old_name}'", f"library('{new_name}'", 1)
    versions = f"{indent}soversion: hb_so_version,\n{indent}version: version,\n"
    if block.count(versions) != 1:
        raise SystemExit(f"Meson versioned target drift: {old_name}")
    block = block.replace(versions, "", 1)
    return text[:start] + block + text[end:]

text = patch_target(
    text,
    "libharfbuzz = library('harfbuzz', hb_sources,\n",
    "\n)\n\nlibharfbuzz_dep",
    "harfbuzz",
    "goo-harfbuzz",
    "  ",
)
text = patch_target(
    text,
    "  libharfbuzz_gpu = library('harfbuzz-gpu',\n",
    "\n  )\n\n  install_headers(hb_gpu_headers",
    "harfbuzz-gpu",
    "goo-harfbuzz-gpu",
    "    ",
)
path.write_text(text, encoding="utf-8")
PY

export SOURCE_DATE_EPOCH=0
export MACOSX_DEPLOYMENT_TARGET="$deployment_target"
export CFLAGS="-O3 -g0 -ffile-prefix-map=$work=."
export CXXFLAGS="$CFLAGS"
export LDFLAGS='-Wl,-dead_strip'
common_options=(--prefix=/usr --libdir=lib --buildtype=release --default-library=shared --wrap-mode=nodownload)
harfbuzz_options=(-Dglib=disabled -Dgobject=disabled -Dcairo=disabled -Dchafa=disabled -Dpng=disabled -Dzlib=disabled -Dicu=disabled -Dgraphite=disabled -Dgraphite2=disabled -Dfreetype=disabled -Dfontations=disabled -Dgdi=disabled -Ddirectwrite=disabled -Dcoretext=disabled -Dharfrust=disabled -Dkbts=disabled -Dwasm=disabled -Draster=disabled -Dvector=disabled -Dgpu=enabled -Dsubset=disabled -Dtests=disabled -Dintrospection=disabled -Ddocs=disabled -Ddoc_tests=false -Dutilities=disabled -Dbenchmark=disabled -Dgpu_demo=disabled -Dwith_libstdcxx=false)
meson setup "$work/harfbuzz-build" "$work/harfbuzz-14.3.1" "${common_options[@]}" "${harfbuzz_options[@]}"
ninja -C "$work/harfbuzz-build" -j"$(sysctl -n hw.logicalcpu)"

harfbuzz_library="$(find "$work/harfbuzz-build" -type f -name 'libgoo-harfbuzz.dylib' -print | LC_ALL=C sort | head -n 1)"
gpu_library="$(find "$work/harfbuzz-build" -type f -name 'libgoo-harfbuzz-gpu.dylib' -print | LC_ALL=C sort | head -n 1)"
[[ -n "$harfbuzz_library" && -n "$gpu_library" ]]
harfbuzz_output="$staging/libgoo-harfbuzz.dylib"
gpu_output="$staging/libgoo-harfbuzz-gpu.dylib"
install -m 0755 "$harfbuzz_library" "$harfbuzz_output"
install -m 0755 "$gpu_library" "$gpu_output"
strip -x "$harfbuzz_output"
strip -x "$gpu_output"
codesign --force --sign - --timestamp=none "$harfbuzz_output"
codesign --force --sign - --timestamp=none "$gpu_output"
for library in "$harfbuzz_output" "$gpu_output"; do
  minos="$(otool -l "$library" | awk '$1 == "minos" { print $2; exit }')"
  [[ "$minos" == "$deployment_target" ]]
done

python3 "$repo_root/tools/Goo.TextNative/record-build.py" \
  --manifest "$manifest" \
  --target osx-arm64 \
  --output "$staging" \
  --artifact "harfbuzz=$harfbuzz_output" \
  --artifact "gpu=$gpu_output"
python3 - "$staging/text-native-build.json" "$deployment_target" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
evidence = json.loads(path.read_text(encoding="utf-8"))
evidence["buildEvidence"]["deploymentTarget"] = sys.argv[2]
path.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY
install -m 0755 "$harfbuzz_output" "$output/libgoo-harfbuzz.dylib"
install -m 0755 "$gpu_output" "$output/libgoo-harfbuzz-gpu.dylib"
install -m 0644 "$staging/text-native-build.json" "$output/text-native-build.json"
