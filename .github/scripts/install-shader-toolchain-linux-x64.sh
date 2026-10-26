#!/usr/bin/env bash
set -euo pipefail

root="${1:?usage: install-shader-toolchain-linux-x64.sh OUTPUT_ROOT}"
archive="$root/slang-2026.16-linux-x86_64-glibc-2.27.tar.gz"
slang_sdk="$root/slang-2026.16"
spirv_source="$root/SPIRV-Tools-1.4.357.0"
spirv_headers="$spirv_source/external/spirv-headers"
spirv_build="$root/SPIRV-Tools-1.4.357.0-build"
vulkan_sdk="$root/vulkan-sdk-1.4.357.0"

for executable in clang clang++ cmake curl git ninja sha256sum tar
do
  command -v "$executable" >/dev/null
done

rm -rf "$slang_sdk" "$spirv_source" "$spirv_build" "$vulkan_sdk"
mkdir -p "$root" "$slang_sdk"
curl --fail --location --retry 5 --retry-all-errors --retry-delay 2 \
  --output "$archive" \
  https://github.com/shader-slang/slang/releases/download/v2026.16/slang-2026.16-linux-x86_64-glibc-2.27.tar.gz
echo "b9c5e195ce9a7124147d47febe78b7f8c59c96829add50b0938bd04b8056fb88  $archive" \
  | sha256sum --check -
tar -xzf "$archive" -C "$slang_sdk"
test "$("$slang_sdk/bin/slangc" -version 2>&1)" = "2026.16"

git clone --depth 1 --branch vulkan-sdk-1.4.357.0 \
  https://github.com/KhronosGroup/SPIRV-Tools.git "$spirv_source"
test "$(git -C "$spirv_source" rev-parse HEAD)" = \
  "9a49b0883b9b635689a85b5647dbfcb223268151"
git init "$spirv_headers"
git -C "$spirv_headers" remote add origin \
  https://github.com/KhronosGroup/SPIRV-Headers.git
git -C "$spirv_headers" fetch --depth 1 origin \
  29981f65241605e08b0ede4cfeb999fe3b723c6a
git -C "$spirv_headers" checkout --detach FETCH_HEAD
test "$(git -C "$spirv_headers" rev-parse HEAD)" = \
  "29981f65241605e08b0ede4cfeb999fe3b723c6a"
cmake -S "$spirv_source" -B "$spirv_build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER=clang \
  -DCMAKE_CXX_COMPILER=clang++ \
  -DSPIRV_SKIP_TESTS=ON \
  -DSPIRV_WERROR=OFF
cmake --build "$spirv_build" --target spirv-val --parallel 2
install -Dm755 "$spirv_build/tools/spirv-val" "$vulkan_sdk/bin/spirv-val"
"$vulkan_sdk/bin/spirv-val" --version 2>&1 \
  | grep -F "SPIRV-Tools v2026.3 vulkan-sdk-1.4.357.0"

printf 'SLANG_SDK=%s\n' "$slang_sdk"
printf 'VULKAN_SDK=%s\n' "$vulkan_sdk"
