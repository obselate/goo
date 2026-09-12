#!/usr/bin/env bash
set -euo pipefail

publish="${1:?usage: stage-linux-x64.sh PUBLISH_DIR BUNDLE_DIR SYMBOLS_DIR}"
bundle="${2:?usage: stage-linux-x64.sh PUBLISH_DIR BUNDLE_DIR SYMBOLS_DIR}"
symbols="${3:?usage: stage-linux-x64.sh PUBLISH_DIR BUNDLE_DIR SYMBOLS_DIR}"

runtime_files=(
  Goo.PackageSmoke.deps.json
  Goo.PackageSmoke.dll
  Goo.PackageSmoke.runtimeconfig.json
  Goo.dll
  Gsharp.Extensions.dll
  Hexa.NET.SDL3.dll
  HexaGen.Runtime.dll
  StbImageSharp.dll
  Unicode.Bidi.dll
  Yoga.Net.dll
  libSDL3.so
  libgoo-harfbuzz-gpu.so
  libgoo-harfbuzz.so
  text-native-build.json
)
vulkan_files=(
  Vulkan/Runtime/HarfBuzz-COPYING.txt
  Vulkan/Shaders/analytic.vert.spv
  Vulkan/Shaders/analytic_blend.frag.spv
  Vulkan/Shaders/analytic_shadow.frag.spv
  Vulkan/Shaders/analytic_border.frag.spv
  Vulkan/Shaders/analytic_linear4.frag.spv
  Vulkan/Shaders/analytic_radial4.frag.spv
  Vulkan/Shaders/analytic_sampled_image.frag.spv
  Vulkan/Shaders/analytic_solid.frag.spv
  Vulkan/Shaders/clip_mask.frag.spv
  Vulkan/Shaders/clip_mask.vert.spv
  Vulkan/Shaders/hb_gpu.vert.spv
  Vulkan/Shaders/hb_gpu_draw.frag.spv
  Vulkan/Shaders/hb_gpu_paint.frag.spv
  Vulkan/Shaders/lava.frag.spv
  Vulkan/Shaders/path_band.frag.spv
  Vulkan/Shaders/path_band.vert.spv
  Vulkan/Shaders/shader-manifest.json
  Vulkan/Shaders/harfbuzz-14.3.1.provenance.json
  Vulkan/Shaders/solid_quad.frag.spv
  Vulkan/Shaders/solid_quad.vert.spv
)
publish_extras=(
  Goo.PackageSmoke.pdb
  Gsharp.Extensions.pdb
  Gsharp.Extensions.xml
  Vulkan/Runtime/MoltenVK-LICENSE.txt
  VendSans-VariableFont_wght.ttf
  HarfBuzz-adwaita-colrv1.ttf
  HarfBuzz-TTC.ttc
  HarfBuzz-cff-f1.otf
  HarfBuzz-cff-f2.otf
  HarfBuzz-cff.otc
  HarfBuzz-cff-style-regular.otf
  HarfBuzz-cff-style-bold.otf
  HarfBuzz-cff-style-italic.otf
)

mapfile -t actual < <(find "$publish" -mindepth 1 -type f \
  -printf '%P\n' | LC_ALL=C sort)
printf '%s\n' "${runtime_files[@]}" "${vulkan_files[@]}" "${publish_extras[@]}" | \
  LC_ALL=C sort >"$publish/.expected-files"
printf '%s\n' "${actual[@]}" >"$publish/.actual-files"
if ! cmp -s "$publish/.expected-files" "$publish/.actual-files"; then
  diff -u "$publish/.expected-files" "$publish/.actual-files" || true
  rm -f "$publish/.expected-files" "$publish/.actual-files"
  printf 'publish output allowlist mismatch\n' >&2
  exit 1
fi
rm -f "$publish/.expected-files" "$publish/.actual-files"

rm -rf "$bundle" "$symbols"
mkdir -p "$bundle" "$symbols"
for name in "${runtime_files[@]}" "${vulkan_files[@]}"; do
  install -Dm0644 "$publish/$name" "$bundle/$name"
done
for name in LICENSE README.md CHANGELOG.md THIRD-PARTY-NOTICES.md; do
  install -m 0644 "$name" "$bundle/$name"
done
for name in "$publish"/*.pdb; do
  install -m 0644 "$name" "$symbols/$(basename "$name")"
done
(
  cd "$bundle"
  find . -mindepth 1 -type f ! -name SHA256SUMS \
    -printf '%P\n' | LC_ALL=C sort | xargs sha256sum >SHA256SUMS
)
