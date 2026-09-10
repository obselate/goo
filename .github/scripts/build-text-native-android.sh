#!/usr/bin/env bash
set -euo pipefail

target="${1:?usage: build-text-native-android.sh android-arm64|android-x64 OUTPUT_DIRECTORY [NDK_DIRECTORY]}"
output="${2:?output directory is required}"
ndk="${3:-${ANDROID_NDK_HOME:-}}"
[[ -n "$ndk" ]] || { printf 'Set ANDROID_NDK_HOME or provide the NDK directory\n' >&2; exit 1; }
script_dir="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(CDPATH='' cd -- "$script_dir/../.." && pwd)"
manifest="$repo_root/tools/Goo.TextNative/manifest.json"
for command_name in curl sha256sum tar meson ninja readelf file patch python3; do
  command -v "$command_name" >/dev/null || { printf 'required command missing: %s\n' "$command_name" >&2; exit 1; }
done
case "$target" in
  android-arm64) cpu=aarch64; triple=aarch64-linux-android ;;
  android-x64) cpu=x86_64; triple=x86_64-linux-android ;;
  *) printf 'unsupported Android RID: %s\n' "$target" >&2; exit 1 ;;
esac
python3 - "$manifest" "$ndk/source.properties" <<'PY'
import json
import re
import sys
from pathlib import Path

policy = json.loads(Path(sys.argv[1]).read_text())["build"]["android"]
revision = re.search(r"Pkg.Revision\s*=\s*(\S+)", Path(sys.argv[2]).read_text())
if revision is None or revision[1] != policy["ndkVersion"]:
    raise SystemExit("Android NDK version does not match tools/Goo.TextNative/manifest.json")
PY
toolchain="$ndk/toolchains/llvm/prebuilt/linux-x86_64/bin"
api="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["build"]["android"]["minimumApi"])' "$manifest")"
export CC="$toolchain/$triple$api-clang"
export CXX="$toolchain/$triple$api-clang++"
export STRIP="$toolchain/llvm-strip"
[[ -x "$CC" && -x "$CXX" && -x "$STRIP" ]] || { printf 'Linux NDK LLVM toolchain is missing\n' >&2; exit 1; }
work="$(mktemp -d -t goo-text-native-android.XXXXXX)"
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$output" "$work/output"
output="$(CDPATH='' cd -- "$output" && pwd)"
readarray -t source < <(python3 - "$manifest" <<'PY'
import json
import sys
value = json.load(open(sys.argv[1]))["source"]["harfbuzz"]
for key in ("archiveUrl", "archiveSha256", "version"):
    print(value[key])
PY
)
curl -fsSL --retry 3 --retry-delay 2 "${source[0]}" -o "$work/harfbuzz.tar.xz"
printf '%s  %s\n' "${source[1]}" "$work/harfbuzz.tar.xz" | sha256sum -c -
tar -xJf "$work/harfbuzz.tar.xz" -C "$work"
source_root="$work/harfbuzz-${source[2]}"
python3 "$repo_root/tools/Goo.TextNative/apply-source-patches.py" --manifest "$manifest" --source-root "$source_root"
python3 - "$source_root/src/meson.build" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
text = path.read_text()
for name, marker in (
    ("harfbuzz", "libharfbuzz = library('harfbuzz', hb_sources,\n"),
    ("harfbuzz-gpu", "  libharfbuzz_gpu = library('harfbuzz-gpu',\n    hb_gpu_sources,\n"),
):
    if text.count(marker) != 1:
        raise SystemExit("HarfBuzz Meson source shape drift")
    text = text.replace(marker, marker + f"  link_args: ['-Wl,-soname,libgoo-{name}.so'],\n", 1)
path.write_text(text)
PY
cat > "$work/android.ini" <<EOF
[binaries]
c = '$CC'
cpp = '$CXX'
ar = '$toolchain/llvm-ar'
strip = '$STRIP'
pkg-config = 'false'
[host_machine]
system = 'android'
cpu_family = '$cpu'
cpu = '$cpu'
endian = 'little'
[properties]
needs_exe_wrapper = true
EOF
export SOURCE_DATE_EPOCH=0
export CFLAGS="-O3 -g0 -ffile-prefix-map=$work=."
export CXXFLAGS="$CFLAGS"
export LDFLAGS='-Wl,--build-id=none -Wl,-z,max-page-size=16384'
readarray -t options < <(python3 - "$manifest" <<'PY'
import json
import sys
build = json.load(open(sys.argv[1]))["build"]
print("\n".join(build["commonOptions"] + build["harfbuzzOptions"]))
PY
)
meson setup "$work/build" "$source_root" --cross-file "$work/android.ini" "${options[@]}"
ninja -C "$work/build" -j"${GOO_NATIVE_JOBS:-4}"
for name in harfbuzz harfbuzz-gpu; do
  library="$(find "$work/build/src" -maxdepth 1 -type f -name "lib$name.so*" ! -name '*.symbols' -print)"
  [[ -n "$library" && "$library" != *$'\n'* ]]
  install -m 0755 "$library" "$work/output/libgoo-$name.so"
  "$STRIP" --strip-unneeded "$work/output/libgoo-$name.so"
done
python3 "$repo_root/tools/Goo.TextNative/record-build.py" \
  --manifest "$manifest" --target "$target" --output "$work/output" \
  --artifact "harfbuzz=$work/output/libgoo-harfbuzz.so" \
  --artifact "gpu=$work/output/libgoo-harfbuzz-gpu.so"
install -m 0755 "$work/output/"*.so "$output/"
install -m 0644 "$work/output/text-native-build.json" "$output/"
printf 'Built Android text runtime: %s\n' "$output"
