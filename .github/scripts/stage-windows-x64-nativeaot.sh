#!/usr/bin/env bash
set -euo pipefail

publish="${1:?usage: stage-windows-x64-nativeaot.sh PUBLISH_DIR BUNDLE_DIR SYMBOLS_DIR}"
bundle="${2:?usage: stage-windows-x64-nativeaot.sh PUBLISH_DIR BUNDLE_DIR SYMBOLS_DIR}"
symbols="${3:?usage: stage-windows-x64-nativeaot.sh PUBLISH_DIR BUNDLE_DIR SYMBOLS_DIR}"

runtime_files=(
  Goo.PackageSmoke.exe
  SDL3.dll
  goo-harfbuzz-gpu.dll
  goo-harfbuzz.dll
  run-windows-qualification.ps1
)
vulkan_files=(
  Vulkan/Runtime/HarfBuzz-COPYING.txt
)

rm -rf "$bundle" "$symbols"
mkdir -p "$bundle" "$symbols"
for name in "${runtime_files[@]}" "${vulkan_files[@]}"; do
  test -f "$publish/$name"
  install -Dm0644 "$publish/$name" "$bundle/$name"
done
chmod 0755 "$bundle/Goo.PackageSmoke.exe"
install -m0644 tests/Goo.PackageSmoke/WINDOWS-QUALIFICATION.txt "$bundle/WINDOWS-QUALIFICATION.txt"
install -m0644 "$publish/Goo.PackageSmoke.pdb" "$symbols/Goo.PackageSmoke.pdb"
(
  cd "$bundle"
  find . -mindepth 1 -type f ! -name SHA256SUMS \
    -printf '%P\n' | LC_ALL=C sort | xargs sha256sum >SHA256SUMS
)
