#!/usr/bin/env bash
set -euo pipefail

output="${1:?usage: build-sdl-macos-arm64.sh OUTPUT_DYLIB}"
version=3.4.0
sha256=082cbf5f429e0d80820f68dc2b507a94d4cc1b4e70817b119bbb8ec6a69584b8
deployment_target=14.0
work="$(mktemp -d -t goo-sdl-macos.XXXXXX)"
trap 'rm -rf -- "$work"' EXIT

for command_name in awk cmake codesign curl file install_name_tool lipo otool shasum tar; do
  command -v "$command_name" >/dev/null || { printf 'required command missing: %s\n' "$command_name" >&2; exit 1; }
done

mkdir -p "$work/src" "$work/build" "$work/install"
curl -fsSL --retry 3 --retry-delay 2 \
  "https://github.com/libsdl-org/SDL/releases/download/release-${version}/SDL3-${version}.tar.gz" \
  -o "$work/SDL3.tar.gz"
printf '%s  %s\n' "$sha256" "$work/SDL3.tar.gz" | shasum -a 256 -c -
tar -xzf "$work/SDL3.tar.gz" -C "$work/src" --strip-components=1
cmake -S "$work/src" -B "$work/build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$work/install" \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET="$deployment_target" \
  -DSDL_AUDIO=ON \
  -DSDL_CAMERA=OFF \
  -DSDL_DIALOG=OFF \
  -DSDL_GPU=OFF \
  -DSDL_HAPTIC=OFF \
  -DSDL_HIDAPI=OFF \
  -DSDL_JOYSTICK=OFF \
  -DSDL_OPENGL=OFF \
  -DSDL_OPENGLES=OFF \
  -DSDL_POWER=OFF \
  -DSDL_RENDER=OFF \
  -DSDL_SENSOR=OFF \
  -DSDL_SHARED=ON \
  -DSDL_STATIC=OFF \
  -DSDL_TEST_LIBRARY=OFF \
  -DSDL_TRAY=OFF \
  -DSDL_VULKAN=ON
cmake --build "$work/build" --parallel "$(sysctl -n hw.logicalcpu)"
cmake --install "$work/build"

library="$(find "$work/install" -type f -name 'libSDL3*.dylib' -print | LC_ALL=C sort | head -n 1)"
[[ -n "$library" ]]
mkdir -p "$(dirname -- "$output")"
install -m0755 "$library" "$output"
install_name_tool -id @rpath/libSDL3.dylib "$output"
codesign --force --sign - --timestamp=none "$output"
file "$output" | grep -Fq 'Mach-O 64-bit dynamically linked shared library arm64'
[[ "$(lipo -archs "$output")" == arm64 ]]
minos="$(otool -l "$output" | awk '$1 == "minos" { print $2; exit }')"
[[ "$minos" == "$deployment_target" ]]
