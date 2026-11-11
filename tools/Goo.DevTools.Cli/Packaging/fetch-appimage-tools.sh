#!/usr/bin/env bash
set -euo pipefail

destination="${1:?usage: fetch-appimage-tools.sh OUTPUT_DIR}"
mkdir -p "$destination"
headers=(--header 'Accept: application/octet-stream')
if [[ -n "${GH_TOKEN:-}" ]]; then
  headers+=(--header "Authorization: Bearer $GH_TOKEN")
fi
if [ ! -f "$destination/appimagetool-x86_64.AppImage" ]; then
  curl --fail --location --retry 5 --retry-all-errors --retry-delay 2 "${headers[@]}" \
    https://api.github.com/repos/AppImage/appimagetool/releases/assets/324406736 \
    --output "$destination/appimagetool-x86_64.AppImage"
fi
packaging="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$packaging/../Runtime/linux-x64/runtime-x86_64" \
  "$packaging/../Runtime/linux-x64/runtime-x86_64-relink.tar.gz" "$destination/"
printf '%s  %s\n' \
  ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0 "$destination/appimagetool-x86_64.AppImage" \
  eeeffb755aaac54979d752c4a9762715bcbe98ec0cd915e79595393d5c223266 "$destination/runtime-x86_64" \
  dfd8519d717cb44b5d14a5aa4ceff1c44979a7ffddd8218ae71812b8416fddc7 "$destination/runtime-x86_64-relink.tar.gz" \
  | sha256sum --check --strict
chmod 0755 "$destination/appimagetool-x86_64.AppImage"
