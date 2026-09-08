#!/usr/bin/env bash
set -euo pipefail

output="${1:?usage: build-sdl-linux-x64.sh OUTPUT_PATH}"
version="3.4.0"
sha256="082cbf5f429e0d80820f68dc2b507a94d4cc1b4e70817b119bbb8ec6a69584b8"
cmake_version="3.31.8"
cmake_sha256="630615d8e98ac33eba7fbe472626dff5c899c85af3c024585ae109166a6909d0"
wayland_version="1.18.0"
wayland_sha256="4675a79f091020817a98fd0484e7208c8762242266967f55a67776936c2e294d"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
for command_name in curl meson ninja patch pkg-config python3 readelf sha256sum tar; do
  command -v "$command_name" >/dev/null || {
    printf 'required command missing: %s\n' "$command_name" >&2
    exit 1
  }
done

curl -fsSL \
  "https://github.com/Kitware/CMake/releases/download/v${cmake_version}/cmake-${cmake_version}-linux-x86_64.tar.gz" \
  -o "$work/cmake.tar.gz"
printf '%s  %s\n' "$cmake_sha256" "$work/cmake.tar.gz" | sha256sum -c -
mkdir "$work/cmake"
tar -xzf "$work/cmake.tar.gz" -C "$work/cmake" --strip-components=1
cmake="$work/cmake/bin/cmake"

curl -fsSL \
  "https://wayland.freedesktop.org/releases/wayland-${wayland_version}.tar.xz" \
  -o "$work/wayland.tar.xz"
printf '%s  %s\n' "$wayland_sha256" "$work/wayland.tar.xz" | sha256sum -c -
mkdir "$work/wayland-src"
tar -xJf "$work/wayland.tar.xz" -C "$work/wayland-src" --strip-components=1
meson setup "$work/wayland-build" "$work/wayland-src" \
  --prefix="$work/wayland-install" \
  -Ddocumentation=false \
  -Ddtd_validation=false
ninja -C "$work/wayland-build" install
export PATH="$work/wayland-install/bin:$PATH"
export PKG_CONFIG_PATH="$work/wayland-install/lib/x86_64-linux-gnu/pkgconfig:$work/wayland-install/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"

curl -fsSL "https://github.com/libsdl-org/SDL/releases/download/release-${version}/SDL3-${version}.tar.gz" \
  -o "$work/SDL3.tar.gz"
printf '%s  %s\n' "$sha256" "$work/SDL3.tar.gz" | sha256sum -c -
mkdir "$work/src"
tar -xzf "$work/SDL3.tar.gz" -C "$work/src" --strip-components=1
patch -d "$work/src" -p1 --fuzz=0 < \
  "$(dirname "$0")/../patches/sdl/wayland-window-interactions.patch"
python3 "$(dirname "$0")/../../tests/NativeWindow/test_sdl_wayland.py" "$work/src"

# SDL vendors protocols newer than the baseline wayland-scanner schema.
find "$work/src/wayland-protocols" -type f -name '*.xml' \
  -exec sed -i 's/ deprecated-since="[^"]*"//g' {} +

"$cmake" -S "$work/src" -B "$work/build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_FLAGS_RELEASE=-Os \
  -DCMAKE_INSTALL_PREFIX="$work/install" \
  -DSDL_AUDIO=OFF \
  -DSDL_CAMERA=OFF \
  -DSDL_DIALOG=OFF \
  -DSDL_GPU=OFF \
  -DSDL_HAPTIC=OFF \
  -DSDL_HIDAPI=OFF \
  -DSDL_JOYSTICK=OFF \
  -DSDL_KMSDRM=OFF \
  -DSDL_OPENGL=OFF \
  -DSDL_OPENGLES=OFF \
  -DSDL_POWER=OFF \
  -DSDL_RENDER=OFF \
  -DSDL_SENSOR=OFF \
  -DSDL_SHARED=ON \
  -DSDL_STATIC=OFF \
  -DSDL_TEST_LIBRARY=OFF \
  -DSDL_TRAY=OFF \
  -DSDL_VULKAN=ON \
  -DSDL_WAYLAND=ON \
  -DSDL_X11=OFF
"$cmake" --build "$work/build"
"$cmake" --install "$work/build" --strip

install -D -m 0644 "$(readlink -f "$work/install/lib/libSDL3.so")" "$output"
max_glibc="$(readelf --version-info "$output" | grep -o 'GLIBC_[0-9.]*' | sort -Vu | tail -1 | cut -d_ -f2)"
if [[ "$(printf '%s\n' 2.27 "$max_glibc" | sort -V | tail -1)" != "2.27" ]]; then
  printf 'libSDL3.so requires glibc %s; maximum allowed is 2.27\n' "$max_glibc" >&2
  exit 1
fi
printf 'Built %s (%s bytes, GLIBC <= %s)\n' \
  "$output" "$(stat -c %s "$output")" "$max_glibc"
