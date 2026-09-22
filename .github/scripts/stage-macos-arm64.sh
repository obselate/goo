#!/usr/bin/env bash
set -euo pipefail

publish="${1:?usage: stage-macos-arm64.sh PUBLISH_DIR APP_PATH SYMBOLS_DIR EXECUTABLE PLIST}"
app="${2:?usage: stage-macos-arm64.sh PUBLISH_DIR APP_PATH SYMBOLS_DIR EXECUTABLE PLIST}"
symbols="${3:?usage: stage-macos-arm64.sh PUBLISH_DIR APP_PATH SYMBOLS_DIR EXECUTABLE PLIST}"
executable="${4:?usage: stage-macos-arm64.sh PUBLISH_DIR APP_PATH SYMBOLS_DIR EXECUTABLE PLIST}"
plist="${5:?usage: stage-macos-arm64.sh PUBLISH_DIR APP_PATH SYMBOLS_DIR EXECUTABLE PLIST}"
identity="${GOO_MACOS_CODESIGN_IDENTITY:--}"
version="$(python3 .github/scripts/release_version.py --print)"
bundle_version="${version%%-*}"
macos="$app/Contents/MacOS"
resources="$app/Contents/Resources"

test -d "$publish"
test -f "$publish/$executable"
test -f "$plist"
test -f "$publish/libMoltenVK.dylib"
test -f "$publish/libSDL3.dylib"
test -f "$publish/libgoo-harfbuzz.dylib"
test -f "$publish/libgoo-harfbuzz-gpu.dylib"
test -f "$publish/Vulkan/Runtime/HarfBuzz-COPYING.txt"
test -f "$publish/Vulkan/Runtime/MoltenVK-LICENSE.txt"

rm -rf "$app" "$symbols"
mkdir -p "$macos" "$resources" "$symbols"
install -m0644 "$plist" "$app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $version" "$app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $bundle_version" "$app/Contents/Info.plist"

while IFS= read -r -d '' source; do
  relative="${source#"$publish/"}"
  case "$relative" in
    *.pdb|*.dbg|*.xml|*.dSYM/*|Vulkan/Shaders/*|*/Authoring/*|Goo.ShaderEffectTool.*|*.so|SDL3.dll|goo-harfbuzz.dll|goo-harfbuzz-gpu.dll|gsc.dll|gsfmt.dll|text-native-build.json|*/text-native-build.json)
      continue
      ;;
  esac
  if [[ "$relative" == "$executable" || "$relative" == *.dylib ]]; then
    destination="$macos/$relative"
  else
    destination="$resources/$relative"
  fi
  mkdir -p "$(dirname -- "$destination")"
  install -m0644 "$source" "$destination"
done < <(find "$publish" -type f -print0)

while IFS= read -r -d '' resource; do
  name="$(basename -- "$resource")"
  ln -s "../Resources/$name" "$macos/$name"
done < <(find "$resources" -mindepth 1 -maxdepth 1 -print0)

chmod 0755 "$macos/$executable"
for library in "$macos"/*.dylib; do
  chmod 0755 "$library"
done
if ! otool -l "$macos/$executable" | grep -A2 LC_RPATH | grep -Fq '@executable_path'; then
  install_name_tool -add_rpath @executable_path "$macos/$executable"
fi
for library in "$macos"/*.dylib; do
  codesign --force --sign "$identity" --timestamp=none "$library"
done
codesign --force --sign "$identity" --timestamp=none "$macos/$executable"
codesign --force --sign "$identity" --timestamp=none "$app"
codesign --verify --deep --strict "$app"
plutil -lint "$app/Contents/Info.plist"
if [[ -d "$publish/$executable.dSYM" ]]; then
  ditto "$publish/$executable.dSYM" "$symbols/$executable.dSYM"
fi
