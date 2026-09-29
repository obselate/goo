#!/usr/bin/env bash
set -euo pipefail

output="${1:?usage: build-text-native-linux-x64.sh OUTPUT_DIRECTORY [--static]}"
static_enabled=false
if [[ "${2:-}" == "--static" ]]; then static_enabled=true; fi
script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../.." && pwd)"
manifest="$repo_root/tools/Goo.TextNative/manifest.json"
hb_url='https://github.com/harfbuzz/harfbuzz/releases/download/14.3.1/harfbuzz-14.3.1.tar.xz'
hb_sha256='9dae9538aae2ffdf70cec31f2c27bf68e2aaeeae3112688467697d5faf6194f7'
for command_name in curl sha256sum tar meson ninja readelf strip file patch python3; do
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
    raise SystemExit("HarfBuzz manifest hash drift")
if manifest["outputs"]["linux-x64"] != {
    "harfbuzz": "libgoo-harfbuzz.so",
    "gpu": "libgoo-harfbuzz-gpu.so",
}:
    raise SystemExit("Linux output name drift")
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
if manifest["build"]["environments"]["linux-x64"] != {
    "SOURCE_DATE_EPOCH": "0",
    "CFLAGS": "-O3 -g0 -ffile-prefix-map=<temporary-source-root>=.",
    "CXXFLAGS": "-O3 -g0 -ffile-prefix-map=<temporary-source-root>=.",
    "LDFLAGS": "-Wl,--build-id=none",
}:
    raise SystemExit("Linux build environment drift")
if manifest["build"]["linux"] != {
    "requiredFormat": "ELF 64-bit LSB shared object, x86-64",
    "maxGlibc": "2.27",
    "requiredRpath": {"harfbuzz": [], "gpu": []},
    "requiredRunpath": {"harfbuzz": [], "gpu": ["$ORIGIN/"]},
    "requiredNeeded": {
        "harfbuzz": ["libc.so.6", "libm.so.6", "libpthread.so.0"],
        "gpu": ["libc.so.6", "libgoo-harfbuzz.so", "libm.so.6"],
    },
}:
    raise SystemExit("Linux native policy drift")
PY
work="$(mktemp -d -t goo-text-native-linux.XXXXXX)"
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$output"
output="$(CDPATH= cd -- "$output" && pwd)"
for legacy in libharfbuzz.so libfreetype.so libgoo-text.so libgoo-freetype.so libgoo-text-native.so; do
  rm -f -- "$output/$legacy"
done
staging="$work/output"
mkdir -p "$staging"
curl -fsSL --retry 3 --retry-delay 2 "$hb_url" -o "$work/harfbuzz.tar.xz"
printf '%s  %s\n' "$hb_sha256" "$work/harfbuzz.tar.xz" | sha256sum -c -
tar -xJf "$work/harfbuzz.tar.xz" -C "$work"
python3 "$repo_root/tools/Goo.TextNative/apply-source-patches.py" --manifest "$manifest" --source-root "$work/harfbuzz-14.3.1"
python3 - "$work/harfbuzz-14.3.1/src/meson.build" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
core = "libharfbuzz = library('harfbuzz', hb_sources,\n"
gpu = "  libharfbuzz_gpu = library('harfbuzz-gpu',\n    hb_gpu_sources,\n"
if text.count(core) != 1 or text.count(gpu) != 1:
  raise SystemExit("HarfBuzz Meson source shape drift")
text = text.replace(core, core + "  link_args: ['-Wl,-soname,libgoo-harfbuzz.so'],\n", 1)
text = text.replace(gpu, gpu + "    link_args: ['-Wl,-soname,libgoo-harfbuzz-gpu.so'],\n", 1)
path.write_text(text, encoding="utf-8")
PY
export SOURCE_DATE_EPOCH=0
export CFLAGS="-O3 -g0 -ffile-prefix-map=$work=."
export CXXFLAGS="$CFLAGS"
export LDFLAGS='-Wl,--build-id=none'
library_mode=shared
if "$static_enabled"; then library_mode=both; fi
common_options=(--prefix=/usr --libdir=lib --buildtype=release --default-library="$library_mode" --wrap-mode=nodownload)
harfbuzz_options=(-Dglib=disabled -Dgobject=disabled -Dcairo=disabled -Dchafa=disabled -Dpng=disabled -Dzlib=disabled -Dicu=disabled -Dgraphite=disabled -Dgraphite2=disabled -Dfreetype=disabled -Dfontations=disabled -Dgdi=disabled -Ddirectwrite=disabled -Dcoretext=disabled -Dharfrust=disabled -Dkbts=disabled -Dwasm=disabled -Draster=disabled -Dvector=disabled -Dgpu=enabled -Dsubset=disabled -Dtests=disabled -Dintrospection=disabled -Ddocs=disabled -Ddoc_tests=false -Dutilities=disabled -Dbenchmark=disabled -Dgpu_demo=disabled -Dwith_libstdcxx=false)
meson setup "$work/harfbuzz-build" "$work/harfbuzz-14.3.1" "${common_options[@]}" "${harfbuzz_options[@]}"
ninja -C "$work/harfbuzz-build" -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf 2)"
harfbuzz_library="$(find "$work/harfbuzz-build" -type f -name 'libharfbuzz.so.*' ! -name '*.symbols' -print | LC_ALL=C sort | tail -n 1)"
gpu_library="$(find "$work/harfbuzz-build" -type f -name 'libharfbuzz-gpu.so.*' ! -name '*.symbols' -print | LC_ALL=C sort | tail -n 1)"
[[ -n "$harfbuzz_library" && -n "$gpu_library" ]]
harfbuzz_output="$staging/libgoo-harfbuzz.so"
gpu_output="$staging/libgoo-harfbuzz-gpu.so"
install -m 0755 "$harfbuzz_library" "$harfbuzz_output"
install -m 0755 "$gpu_library" "$gpu_output"
strip --strip-unneeded "$harfbuzz_output"
strip --strip-unneeded "$gpu_output"
file "$harfbuzz_output" | grep -Eq 'ELF 64-bit.*x86-64'
file "$gpu_output" | grep -Eq 'ELF 64-bit.*x86-64'
readelf --dynamic "$harfbuzz_output" | grep -Eq 'SONAME.*\[libgoo-harfbuzz\.so\]'
readelf --dynamic "$gpu_output" | grep -Eq 'SONAME.*\[libgoo-harfbuzz-gpu\.so\]'
readelf --dynamic "$gpu_output" | grep -Fq 'Shared library: [libgoo-harfbuzz.so]'
if readelf --dynamic "$harfbuzz_output" | grep -Eiq 'freetype|glib|icu|graphite|zlib|png'; then
  printf 'HarfBuzz unexpectedly links a disabled integration\n' >&2
  exit 1
fi
if readelf --dynamic "$gpu_output" | grep -Eiq 'freetype|glib|icu|graphite|zlib|png'; then
  printf 'hb-gpu unexpectedly links a disabled integration\n' >&2
  exit 1
fi
for artifact in "$harfbuzz_output" "$gpu_output"; do
  versions="$(readelf --version-info "$artifact" | grep -o 'GLIBC_[0-9.]*' | sort -Vu || true)"
  if [[ -n "$versions" ]]; then
    max_glibc="$(printf '%s\n' "$versions" | tail -n 1 | cut -d_ -f2)"
    if [[ "$(printf '%s\n' 2.27 "$max_glibc" | sort -V | tail -n 1)" != '2.27' ]]; then
      printf '%s requires GLIBC_%s; maximum allowed is GLIBC_2.27\n' "$(basename "$artifact")" "$max_glibc" >&2
      exit 1
    fi
  fi
done
python3 "$repo_root/tools/Goo.TextNative/record-build.py" \
  --manifest "$manifest" \
  --target linux-x64 \
  --output "$staging" \
  --artifact "harfbuzz=$harfbuzz_output" \
  --artifact "gpu=$gpu_output"
install -m 0755 "$harfbuzz_output" "$output/libgoo-harfbuzz.so"
install -m 0755 "$gpu_output" "$output/libgoo-harfbuzz-gpu.so"
if "$static_enabled"; then
  install -m 0644 "$work/harfbuzz-build/src/libharfbuzz.a" "$output/libgoo-harfbuzz.a"
  install -m 0644 "$work/harfbuzz-build/src/libharfbuzz-gpu.a" "$output/libgoo-harfbuzz-gpu.a"
fi
install -m 0644 "$staging/text-native-build.json" "$output/text-native-build.json"
printf 'Built %s (%s bytes)\n' "$output/libgoo-harfbuzz.so" "$(stat -c %s "$output/libgoo-harfbuzz.so")"
printf 'Built %s (%s bytes)\n' "$output/libgoo-harfbuzz-gpu.so" "$(stat -c %s "$output/libgoo-harfbuzz-gpu.so")"
