#!/usr/bin/env bash
set -euo pipefail

output="${1:?usage: fetch-moltenvk-macos-arm64.sh OUTPUT_DYLIB}"
version=1.4.2
sha256=f95765a6229cb7b915990a2890ce12ebe36a730b021545d3d52ae69ce4c4024e
member=MoltenVK/MoltenVK/dynamic/dylib/macOS/libMoltenVK.dylib
work="$(mktemp -d -t goo-moltenvk-macos.XXXXXX)"
trap 'rm -rf -- "$work"' EXIT

for command_name in codesign curl file install_name_tool lipo shasum tar; do
  command -v "$command_name" >/dev/null || { printf 'required command missing: %s\n' "$command_name" >&2; exit 1; }
done

curl -fsSL --retry 5 --retry-delay 2 --retry-max-time 120 --retry-all-errors \
  "https://github.com/KhronosGroup/MoltenVK/releases/download/v${version}/MoltenVK-macos.tar" \
  -o "$work/MoltenVK-macos.tar"
printf '%s  %s\n' "$sha256" "$work/MoltenVK-macos.tar" | shasum -a 256 -c -
tar -xf "$work/MoltenVK-macos.tar" -C "$work" "$member"
mkdir -p "$(dirname -- "$output")"
lipo "$work/$member" -thin arm64 -output "$output"
install_name_tool -id @rpath/libMoltenVK.dylib "$output"
codesign --force --sign - --timestamp=none "$output"
file "$output" | grep -Fq 'Mach-O 64-bit dynamically linked shared library arm64'
[[ "$(lipo -archs "$output")" == arm64 ]]
