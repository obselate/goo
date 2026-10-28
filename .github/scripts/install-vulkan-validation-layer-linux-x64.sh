#!/usr/bin/env bash
set -euo pipefail

root="${1:?usage: install-vulkan-validation-layer-linux-x64.sh OUTPUT_ROOT}"
version="1.4.313.0~rc2-1lunarg24.04-1"
archive="$root/vulkan-validationlayers_${version}_amd64.deb"
install_root="$root/vulkan-validationlayers-1.4.313.0"
layer_path="$install_root/usr/share/vulkan/explicit_layer.d"
library_path="$install_root/usr/lib/x86_64-linux-gnu"

for executable in curl dpkg-deb dotnet sha256sum
do
  command -v "$executable" >/dev/null
done

test "$(uname -s)" = "Linux"
test "$(uname -m)" = "x86_64"
test ! -e "$install_root"
mkdir -p "$root" "$install_root"
if [[ ! -f "$archive" ]]; then
  curl --fail --location --retry 5 --retry-all-errors --retry-delay 2 \
    --connect-timeout 20 --speed-limit 1024 --speed-time 30 \
    --output "$archive" \
    "https://packages.lunarg.com/vulkan/1.4.313/pool/main/v/vulkan-validationlayers/vulkan-validationlayers_${version}_amd64.deb"
fi
echo "b100bfafac3df98c5d8ef5a572b423bcd9ebf3fab963e2e68957f4bf6f2423f0  $archive" \
  | sha256sum --check -
test "$(dpkg-deb --field "$archive" Package)" = "vulkan-validationlayers"
test "$(dpkg-deb --field "$archive" Version)" = "$version"
test "$(dpkg-deb --field "$archive" Architecture)" = "amd64"
dpkg-deb --extract "$archive" "$install_root"
library="$library_path/libVkLayer_khronos_validation.so"
test -f "$library"
repository="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
dotnet run --project "$repository/tools/Goo.VulkanManifest/Goo.VulkanManifest.gsproj" \
  -c Release -- "$layer_path/VkLayer_khronos_validation.json" "$library"

printf 'VK_LAYER_PATH=%s\n' "$layer_path"
printf 'VK_VALIDATION_LAYER_LIBRARY=%s\n' "$library"
