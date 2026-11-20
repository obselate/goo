#!/usr/bin/env bash
set -euo pipefail
output="${1:?usage: build-text-native-wasm.sh OUTPUT_DIRECTORY}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
manifest="$root/tools/Goo.TextNative/manifest.json"
mkdir -p "$output"
output="$(cd "$output" && pwd)"
work="$(mktemp -d "${TMPDIR:-$output}/goo-text-wasm.XXXXXX")"
trap 'rm -rf "$work"' EXIT
sdk="$(dirname "$(readlink -f "$(command -v dotnet)")")"
emscripten="$(find "$sdk/packs/Microsoft.NET.Runtime.Emscripten.3.1.56.Sdk.linux-x64" -name emcc -type f | sort -V | tail -1)"
export PATH="$(dirname "$emscripten"):$PATH"
node="$(find "$sdk/packs/Microsoft.NET.Runtime.Emscripten.3.1.56.Node.linux-x64" -name node -type f | sort -V | tail -1)"
export EM_NODE_JS="$node"
export EM_CACHE="$(find "$sdk/packs/Microsoft.NET.Runtime.Emscripten.3.1.56.Cache.linux-x64" -name sysroot -type d | sort -V | tail -1 | xargs dirname)"
curl -fL "$(jq -r .source.harfbuzz.archiveUrl "$manifest")" -o "$work/harfbuzz.tar.xz"
export DOTNET_EMSCRIPTEN_NODE_JS="$node"
export DOTNET_EMSCRIPTEN_LLVM_ROOT="$(dirname "$(dirname "$emscripten")")/bin"
export DOTNET_EMSCRIPTEN_BINARYEN_ROOT="$(dirname "$(dirname "$emscripten")")"
printf '%s  %s\n' "$(jq -r .source.harfbuzz.archiveSha256 "$manifest")" "$work/harfbuzz.tar.xz" | sha256sum -c -
tar -xJf "$work/harfbuzz.tar.xz" -C "$work"
source="$work/harfbuzz-$(jq -r .source.harfbuzz.version "$manifest")"
python3 "$root/tools/Goo.TextNative/add-image-sources.py" --manifest "$manifest" --source-root "$source"
cat > "$work/cross.ini" <<EOF
[binaries]
c = 'emcc'
cpp = 'em++'
ar = 'emar'
strip = 'emstrip'
[host_machine]
system = 'emscripten'
cpu_family = 'wasm32'
cpu = 'wasm32'
endian = 'little'
[properties]
needs_exe_wrapper = true
EOF
mapfile -t options < <(jq -r '.build.harfbuzzOptions[]' "$manifest")
CFLAGS='-O2 -g0 -DHB_NO_MT' CXXFLAGS='-O2 -g0 -DHB_NO_MT' meson setup "$work/build" "$source" \
    --cross-file "$work/cross.ini" --buildtype=release --default-library=static --wrap-mode=nodownload "${options[@]}"
ninja -C "$work/build" -j4
install -m644 "$work/build/src/libharfbuzz.a" "$output/goo-harfbuzz.a"
install -m644 "$work/build/src/libharfbuzz-gpu.a" "$output/goo-harfbuzz-gpu.a"
